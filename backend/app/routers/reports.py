import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db import Call, Evaluation, get_db
from app.models.schemas import EvaluationOut

logger = logging.getLogger(__name__)

router = APIRouter()


async def _save_or_update_evaluation(
    db: AsyncSession, call_id: int, scores: dict
) -> Evaluation:
    result = await db.execute(select(Evaluation).where(Evaluation.call_id == call_id))
    existing = result.scalar_one_or_none()
    if existing:
        for field, value in scores.items():
            setattr(existing, field, value)
        await db.commit()
        await db.refresh(existing)
        return existing

    evaluation = Evaluation(call_id=call_id, **scores)
    db.add(evaluation)
    try:
        await db.commit()
        await db.refresh(evaluation)
        return evaluation
    except IntegrityError:
        # Another request inserted this row first; update that row instead.
        await db.rollback()
        result = await db.execute(select(Evaluation).where(Evaluation.call_id == call_id))
        existing = result.scalar_one_or_none()
        if existing is None:
            raise
        for field, value in scores.items():
            setattr(existing, field, value)
        await db.commit()
        await db.refresh(existing)
        return existing


@router.get("/{call_id}", response_model=EvaluationOut)
async def get_report(call_id: int, db: AsyncSession = Depends(get_db)):
    call = await db.get(Call, call_id)
    if not call:
        raise HTTPException(404, "Call not found")
    if call.status != "completed":
        raise HTTPException(400, "Call has not ended yet")

    result = await db.execute(
        select(Evaluation).where(Evaluation.call_id == call_id)
    )
    eval_row = result.scalar_one_or_none()
    if eval_row:
        all_zero = all(
            getattr(eval_row, k) == 0
            for k in ("empathy", "de_escalation", "policy_adherence", "professionalism", "resolution")
        )
        if all_zero and call.transcript and call.transcript.strip():
            logger.info("Call %d has all-zero cached evaluation with non-empty transcript — re-evaluating", call_id)
            await db.delete(eval_row)
            await db.commit()
        else:
            eval_out = EvaluationOut.model_validate(eval_row)
            eval_out.transcript = call.transcript
            return eval_out

    from app.prompts.evaluator import EVALUATOR_SYSTEM_PROMPT, build_evaluator_prompt
    from app.services import llm, rag

    rag_index = rag.get_rag(call.scenario_id)
    rag_context = ""
    if rag_index:
        chunks = rag_index.query("company policies and procedures")
        rag_context = "\n---\n".join(chunks)

    transcript_text = call.transcript or ""
    logger.info(
        "Evaluating call %d — transcript length: %d chars, first 200: %s",
        call_id, len(transcript_text), transcript_text[:200],
    )
    if not transcript_text.strip():
        logger.error("Call %d has empty transcript, returning default scores", call_id)
        scores = {
            "empathy": 0, "de_escalation": 0, "policy_adherence": 0,
            "professionalism": 0, "resolution": 0,
            "mistakes": "[]",
            "coaching": "No transcript was recorded for this call. Please try again.",
        }
        evaluation = await _save_or_update_evaluation(db, call_id, scores)
        result = EvaluationOut.model_validate(evaluation)
        result.transcript = transcript_text
        return result

    user_prompt = build_evaluator_prompt(transcript_text, rag_context)
    scores = await llm.evaluate_transcript(EVALUATOR_SYSTEM_PROMPT, user_prompt)
    logger.info("Call %d evaluation scores: %s", call_id, {k: scores.get(k) for k in ("empathy", "de_escalation", "policy_adherence", "professionalism", "resolution")})

    evaluation = await _save_or_update_evaluation(db, call_id, scores)

    result = EvaluationOut.model_validate(evaluation)
    result.transcript = call.transcript
    return result


@router.get("/{call_id}/latency")
async def get_latency_report(call_id: int):
    from app.services.profiler import get_report
    return get_report(call_id)
