from datetime import datetime
from sqlalchemy import String, Integer, Float, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.database import Base

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
    maquina_linha_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("maquinas_linha.id"), nullable=True)

    eventos: Mapped[list["Evento"]] = relationship("Evento", back_populates="medicao")
    maquina_linha: Mapped["MaquinaLinha"] = relationship("MaquinaLinha", back_populates="medicoes")

    @property
    def linha_id(self) -> int | None:
        return self.maquina_linha.linha_id if self.maquina_linha else None