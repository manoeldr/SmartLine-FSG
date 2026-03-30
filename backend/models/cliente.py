from sqlalchemy import String, Integer
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base

class Cliente(Base):
    __tablename__ = "clientes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(100), unique=True)