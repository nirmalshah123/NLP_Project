from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db import Call, Evaluation, Scenario, get_db
from app.models.schemas import ScenarioCreate, ScenarioOut

router = APIRouter()


@router.get("", response_model=list[ScenarioOut])
async def list_scenarios(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Scenario).order_by(Scenario.created_at.desc()))
    return result.scalars().all()


@router.post("", response_model=ScenarioOut, status_code=201)
async def create_scenario(
    body: ScenarioCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    scenario = Scenario(**body.model_dump())
    db.add(scenario)
    await db.commit()
    await db.refresh(scenario)

    if body.target_url:
        from app.services.rag import index_scenario

        background_tasks.add_task(index_scenario, scenario.id, body.target_url)

    return scenario


@router.get("/{scenario_id}", response_model=ScenarioOut)
async def get_scenario(scenario_id: int, db: AsyncSession = Depends(get_db)):
    scenario = await db.get(Scenario, scenario_id)
    if not scenario:
        raise HTTPException(404, "Scenario not found")
    return scenario


@router.delete("/{scenario_id}", status_code=204)
async def delete_scenario(scenario_id: int, db: AsyncSession = Depends(get_db)):
    scenario = await db.get(Scenario, scenario_id)
    if not scenario:
        raise HTTPException(404, "Scenario not found")

    # Remove dependent rows first so we never violate NOT NULL/FK constraints.
    call_ids = (
        await db.execute(select(Call.id).where(Call.scenario_id == scenario_id))
    ).scalars().all()
    if call_ids:
        await db.execute(delete(Evaluation).where(Evaluation.call_id.in_(call_ids)))
        await db.execute(delete(Call).where(Call.id.in_(call_ids)))

    await db.delete(scenario)
    await db.commit()
