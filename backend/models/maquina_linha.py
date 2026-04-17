from __future__ import annotations

from sqlalchemy import String, Integer, Float, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.database import Base


# Model da máquina vinculada a uma linha de produção.
# Armazena configurações específicas de cada máquina: velocidade, sobrevelocidade,
# alarmes, multiplicador de produto e se é a máquina crítica da linha.
class MaquinaLinha(Base):
    __tablename__ = "maquinas_linha"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(100))
    ordem: Mapped[int] = mapped_column(Integer)
    linha_id: Mapped[int] = mapped_column(Integer, ForeignKey("linhas.id"))

    # Velocidade em produtos/hora — preenchida apenas na máquina crítica
    velocidade_nominal: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Sobrevelocidade em % acima da nominal — preenchida nas máquinas não críticas
    sobrevelocidade: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Multiplicador aplicado sobre a velocidade nominal para calcular unidades finais
    multiplicador_produto: Mapped[float | None] = mapped_column(Float, nullable=True)

    # JSON string com lista de alarmes/motivos de parada específicos desta máquina
    alarmes: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    # Indica se esta é a máquina crítica da linha — só pode haver uma por linha
    critica: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    linha: Mapped["Linha"] = relationship("Linha", back_populates="maquinas")
    medicoes: Mapped[list["Medicao"]] = relationship("Medicao", back_populates="maquina_linha")

    # Dispositivos WISE vinculados a esta máquina
    wise_devices: Mapped[list["WiseDevice"]] = relationship("WiseDevice", back_populates="maquina_linha", cascade="all, delete-orphan")

    # Fórmulas de cálculo (produção, refugo) configuradas para esta máquina
    wise_formulas: Mapped[list["WiseFormula"]] = relationship("WiseFormula", back_populates="maquina_linha", cascade="all, delete-orphan")