from sqlalchemy import String, Integer
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base


# Model de usuário do sistema SmartLine.
# nivel: 'admin' | 'auditor' | 'cliente'
# senha armazenada como hash bcrypt — nunca em texto plano
class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(100))
    login: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    senha_hash: Mapped[str] = mapped_column(String(200), nullable=False)
    nivel: Mapped[str] = mapped_column(String(20), default='auditor', nullable=False)