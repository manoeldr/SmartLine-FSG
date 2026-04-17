from sqlalchemy import String, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.database import Base


# Representa uma fórmula de cálculo configurada para uma máquina.
# Cada fórmula define como combinar as posições dos WISEs para
# calcular um resultado (produção, refugo, etc.).
#
# A fórmula é armazenada como uma lista ordenada de operações em JSON:
# [
#   {"posicao": "saida",    "operacao": "+"},
#   {"posicao": "inspetor", "operacao": "-"}
# ]
#
# Isso representa: saida - inspetor
# A UI constrói esse JSON via drag-and-drop das posições.
#
# Resultados possíveis:
#   "producao" — valor usado como produção do slot horário
#   "refugo"   — valor usado como refugo do slot horário
#   (extensível para outros tipos futuros)
class WiseFormula(Base):
    __tablename__ = "wise_formulas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Máquina à qual esta fórmula pertence
    maquina_linha_id: Mapped[int] = mapped_column(Integer, ForeignKey("maquinas_linha.id"))

    # O que esta fórmula calcula: "producao" ou "refugo"
    resultado: Mapped[str] = mapped_column(String(50))

    # JSON com a lista ordenada de posições e operações
    # Ex: [{"posicao": "saida", "operacao": "+"}, {"posicao": "inspetor", "operacao": "-"}]
    operacoes: Mapped[str] = mapped_column(String(1000))

    maquina_linha: Mapped["MaquinaLinha"] = relationship("MaquinaLinha", back_populates="wise_formulas")