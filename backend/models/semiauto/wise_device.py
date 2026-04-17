from sqlalchemy import String, Integer, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.database import Base


# Representa um dispositivo WISE-4051 cadastrado numa máquina.
# Cada máquina pode ter N dispositivos, cada um com um IP e uma posição
# física na linha (ex: "saida", "inspetor", "entrada").
class WiseDevice(Base):
    __tablename__ = "wise_devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Máquina à qual este WISE está vinculado
    maquina_linha_id: Mapped[int] = mapped_column(Integer, ForeignKey("maquinas_linha.id"))

    # Endereço IP do dispositivo na rede local
    ip: Mapped[str] = mapped_column(String(50))

    # Label descritivo da posição física na linha
    # Ex: "saida", "inspetor", "entrada", "rotuladora"
    posicao: Mapped[str] = mapped_column(String(100))

    # Ordem de exibição na UI
    ordem: Mapped[int] = mapped_column(Integer, default=1)

    # Indica se este dispositivo está ativo para polling
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)

    maquina_linha: Mapped["MaquinaLinha"] = relationship("MaquinaLinha", back_populates="wise_devices")
    canais: Mapped[list["WiseChannel"]] = relationship("WiseChannel", back_populates="device", cascade="all, delete-orphan")