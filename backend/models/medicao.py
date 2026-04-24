from datetime import datetime
from sqlalchemy import String, Integer, Float, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.database import Base


# Model de medição — registra uma sessão de auditoria de uma máquina.
# Pode ser iniciada manualmente por um auditor, de forma semi-automática
# via WISE-4051, ou futuramente de forma totalmente automática.
class Medicao(Base):
    __tablename__ = "medicoes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Nome do cliente associado à medição
    cliente: Mapped[str] = mapped_column(String(100))

    # Nome da máquina auditada
    maquina: Mapped[str] = mapped_column(String(100))

    # Horário de início do turno configurado no momento da medição (ex: "08:00")
    turno_inicio: Mapped[str] = mapped_column(String(5))

    # Horário de fim do turno configurado no momento da medição (ex: "17:00")
    turno_fim: Mapped[str] = mapped_column(String(5))

    # Velocidade nominal da máquina em unidades/hora — usada para cálculo de performance
    velocidade_nominal: Mapped[float] = mapped_column(Float)

    # Valor do contador de produção no momento em que a medição foi iniciada
    producao_inicial: Mapped[int] = mapped_column(Integer)

    # Valor do contador de produção no momento em que a medição foi finalizada
    # Nulo enquanto a medição estiver ativa
    producao_final: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Timestamp de criação da medição
    timestamp_inicio: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    # Timestamp de finalização da medição — nulo enquanto ativa
    timestamp_fim: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Referência à máquina na linha — usada para vincular eventos e indicadores
    maquina_linha_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("maquinas_linha.id"), nullable=True)

    # Nome do usuário que iniciou a medição — nulo para medições semi-automáticas/automáticas
    usuario_nome: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Tipo da medição:
    #   "manual"         — iniciada e controlada por um auditor
    #   "semiautomatico" — iniciada/finalizada pelo auditor, dados coletados pelo WISE
    #   "automatico"     — totalmente automática, sem intervenção humana (futuro)
    tipo: Mapped[str] = mapped_column(String(20), default="manual", nullable=False)

    eventos: Mapped[list["Evento"]] = relationship("Evento", back_populates="medicao")
    maquina_linha: Mapped["MaquinaLinha"] = relationship("MaquinaLinha", back_populates="medicoes")

    # Propriedade derivada — retorna o ID da linha a partir da máquina vinculada
    @property
    def linha_id(self) -> int | None:
        return self.maquina_linha.linha_id if self.maquina_linha else None