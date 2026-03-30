from sqlalchemy import String, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.database import Base

class Linha(Base):
    __tablename__ = "linhas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(100))
    cliente_id: Mapped[int] = mapped_column(Integer, ForeignKey("clientes.id"))

    cliente: Mapped["Cliente"] = relationship("Cliente", back_populates="linhas")