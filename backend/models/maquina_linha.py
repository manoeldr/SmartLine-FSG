from sqlalchemy import String, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.database import Base

class MaquinaLinha(Base):
    __tablename__ = "maquinas_linha"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(100))
    ordem: Mapped[int] = mapped_column(Integer)
    linha_id: Mapped[int] = mapped_column(Integer, ForeignKey("linhas.id"))

    linha: Mapped["Linha"] = relationship("Linha", back_populates="maquinas")
    medicoes: Mapped[list["Medicao"]] = relationship("Medicao", back_populates="maquina_linha")