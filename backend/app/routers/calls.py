import datetime

from fastapi import APIRouter, Depends, HTTPException, WebSocket
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db import Call, Scenario, get_db
from app.models.schemas import CallOut
from app.services.orchestrator import CallSession

router = APIRouter()

_active_sessions: dict[int, CallSession] = {}


@router.post("/start/{scenario_id}", response_model=CallOut)
async def start_call(scenario_id: int, db: AsyncSession = Depends(get_db)):
    scenario = await db.get(Scenario, scenario_id)
    if not scenario:
        raise HTTPException(404, "Scenario not found")

    call = Call(scenario_id=scenario_id, status="active")
    db.add(call)
    await db.commit()
    await db.refresh(call)

    session = CallSession(
        call_id=call.id,
        scenario_id=scenario.id,
        persona_type=scenario.persona_type,
        objective=scenario.objective,
        difficulty=scenario.difficulty,
    )
    _active_sessions[call.id] = session

    return call


@router.post("/end/{call_id}", response_model=CallOut)
async def end_call(call_id: int, db: AsyncSession = Depends(get_db)):
    call = await db.get(Call, call_id)
    if not call:
        raise HTTPException(404, "Call not found")

    session = _active_sessions.pop(call_id, None)
    if session:
        call.transcript = session.get_transcript()

    call.status = "completed"
    call.ended_at = datetime.datetime.utcnow()
    await db.commit()
    await db.refresh(call)
    return call


@router.websocket("/ws/{call_id}")
async def call_websocket(websocket: WebSocket, call_id: int):
    session = _active_sessions.get(call_id)
    if not session:
        await websocket.close(code=4004, reason="No active session for this call")
        return
    await session.handle_websocket(websocket)
