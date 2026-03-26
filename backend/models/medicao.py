from __future__ import annotations
from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import String, Integer, Float, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.database import Base

if TYPE_CHECKING:
    from backend.models.evento import Evento

class Medicao(Base):
    __tablename__ = "medicoes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cliente: Mapped[str] = mapped_column(String(100))
    maquina: Mapped[str] = mapped_column(String(100))
    turno_inicio: Mapped[str] = mapped_column(String(5))
    turno_fim: Mapped[str] = mapped_column(String(5))
    velocidade_nominal: Mapped[float] = mapped_column(Float)
    producao_inicial: Mapped[int] = mapped_column(Integer)
    producao_final: Mapped[int | None] = mapped_column(Integer, nullable=True)
    timestamp_inicio: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    timestamp_fim: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    eventos: Mapped[list[Evento]] = relationship("Evento", back_populates="medicao")