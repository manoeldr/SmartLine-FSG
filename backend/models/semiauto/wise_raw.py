from datetime import datetime
from sqlalchemy import String, Integer, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base


# Banco bruto de leituras do polling dos dispositivos WISE.
# Cada registro representa uma leitura de um canal num momento específico.
# O worker de tratamento lê esta tabela para gerar eventos e calcular
# produção/refugo na tabela oficial (medicoes/eventos).
#
# Registros desta tabela NÃO são deletados imediatamente — são mantidos
# para auditoria e reprocessamento. Limpeza periódica pode ser feita
# após N dias configurável futuramente.
class WiseRaw(Base):
    __tablename__ = "wise_raw"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Referências para rastreabilidade
    maquina_linha_id: Mapped[int] = mapped_column(Integer, ForeignKey("maquinas_linha.id"))
    device_id: Mapped[int] = mapped_column(Integer, ForeignKey("wise_devices.id"))
    channel_id: Mapped[int] = mapped_column(Integer, ForeignKey("wise_channels.id"))

    # Tipo do canal lido: "DI" ou "Counter"
    tipo: Mapped[str] = mapped_column(String(20))

    # Função do canal: "marcha_parada", "contagem" ou "alarme"
    funcao: Mapped[str] = mapped_column(String(50))

    # Valor bruto lido:
    #   DI      → 0 ou 1
    #   Counter → valor acumulado (ex: 10523)
    valor: Mapped[float] = mapped_column(Float)

    # Momento exato da leitura
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    # Indica se este registro já foi processado pelo worker
    processado: Mapped[bool] = mapped_column(Boolean, default=False)