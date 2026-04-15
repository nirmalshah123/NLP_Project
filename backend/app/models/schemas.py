from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


# ---------- Scenario ----------
class ScenarioCreate(BaseModel):
    persona_type: str
    objective: str
    target_url: str
    difficulty: int = 5


class ScenarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    persona_type: str
    objective: str
    target_url: str
    difficulty: int
    created_at: datetime


# ---------- Call ----------
class CallOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    scenario_id: int
    status: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    transcript: Optional[str] = None


# ---------- Evaluation ----------
class EvaluationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    call_id: int
    empathy: float
    de_escalation: float
    policy_adherence: float
    professionalism: float
    resolution: float
    mistakes: str
    coaching: str
    transcript: Optional[str] = None
    created_at: datetime
