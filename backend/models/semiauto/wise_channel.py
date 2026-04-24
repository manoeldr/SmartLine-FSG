from sqlalchemy import String, Integer, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.database import Base


# Representa um canal configurado num WiseDevice.
# Cada canal tem um tipo (DI ou Counter) e uma função que define
# como o sistema interpreta o valor lido nele.
#
# Tipos possíveis:
#   "DI"      — entrada digital, lê 0 ou 1
#   "Counter" — contador acumulado de pulsos
#
# Funções possíveis:
#   "marcha_parada" — DI: sensor de passagem de produto.
#                     Se o sinal não alternar por tempo_sem_alteracao_segundos → parada.
#                     Quando voltar a alternar → marcha.
#   "contagem"      — Counter: usado nas fórmulas de produção/refugo
#   "alarme"        — DI: quando vai para 1 gera evento de alarme com o motivo definido

class WiseChannel(Base):
    __tablename__ = "wise_channels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # WISE ao qual este canal pertence
    device_id: Mapped[int] = mapped_column(Integer, ForeignKey("wise_devices.id"))

    # Número do canal físico no dispositivo (0–7 para o WISE-4051)
    numero_canal: Mapped[int] = mapped_column(Integer)

    # Tipo do sinal: "DI" ou "Counter"
    tipo: Mapped[str] = mapped_column(String(20))

    # Função do canal: "marcha_parada", "contagem" ou "alarme"
    funcao: Mapped[str] = mapped_column(String(50))

    # Usado apenas quando funcao = "alarme"
    # Nome/motivo do alarme que será registrado no evento
    alarme_motivo: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Usado apenas quando funcao = "marcha_parada"
    # Define quantos segundos o sinal precisa ficar estático (sem alternar entre 0 e 1)
    # para que o worker considere a máquina como parada.
    # Exemplo: se tempo_sem_alteracao_segundos = 30, e o sinal fica em 0 ou 1
    # por 30 segundos sem mudar, gera evento de parada.
    tempo_sem_alteracao_segundos: Mapped[int | None] = mapped_column(Integer, nullable=True, default=30)

    # Indica se este canal está ativo para leitura
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)

    device: Mapped["WiseDevice"] = relationship("WiseDevice", back_populates="canais")