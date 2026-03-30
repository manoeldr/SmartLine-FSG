from __future__ import annotations

from sqlalchemy import String, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.database import Base

class Cliente(Base):
    __tablename__ = "clientes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(100), unique=True)

    linhas: Mapped[list["Linha"]] = relationship("Linha", back_populates="cliente")