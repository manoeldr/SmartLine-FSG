from __future__ import annotations
from backend.models.medicao import Medicao

from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.database import Base

class Evento(Base):
    __tablename__ = "eventos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    medicao_id: Mapped[int] = mapped_column(Integer, ForeignKey("medicoes.id"))
    tipo: Mapped[str] = mapped_column(String(10))
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    motivo: Mapped[str | None] = mapped_column(String(200), nullable=True)
    producao_leitura: Mapped[int | None] = mapped_column(Integer, nullable=True)
    foto_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    medicao: Mapped["Medicao"] = relationship("Medicao", back_populates="eventos")