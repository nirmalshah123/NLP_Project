from __future__ import annotations

import datetime
from typing import List, Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

DATABASE_URL = "sqlite+aiosqlite:///./adversarial.db"

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    persona_type: Mapped[str] = mapped_column(String(50))
    objective: Mapped[str] = mapped_column(Text)
    target_url: Mapped[str] = mapped_column(Text)
    difficulty: Mapped[int] = mapped_column(Integer, default=5)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now()
    )

    calls: Mapped[List[Call]] = relationship(back_populates="scenario")


class Call(Base):
    __tablename__ = "calls"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("scenarios.id"))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    started_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    ended_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, nullable=True)
    transcript: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    scenario: Mapped[Scenario] = relationship(back_populates="calls")
    evaluation: Mapped[Optional[Evaluation]] = relationship(
        back_populates="call", uselist=False
    )


class Evaluation(Base):
    __tablename__ = "evaluations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    call_id: Mapped[int] = mapped_column(ForeignKey("calls.id"), unique=True)
    empathy: Mapped[float] = mapped_column(Float)
    de_escalation: Mapped[float] = mapped_column(Float)
    policy_adherence: Mapped[float] = mapped_column(Float)
    professionalism: Mapped[float] = mapped_column(Float)
    resolution: Mapped[float] = mapped_column(Float)
    mistakes: Mapped[str] = mapped_column(Text, default="[]")
    coaching: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now()
    )

    call: Mapped[Call] = relationship(back_populates="evaluation")


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    async with async_session() as session:
        yield session
