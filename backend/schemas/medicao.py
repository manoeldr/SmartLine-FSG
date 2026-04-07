from datetime import datetime
from pydantic import BaseModel
from .evento import EventoResponse


# Schema de criação de medição. Recebe os dados do auditor ao iniciar uma medição.
# maquina_linha_id é opcional para compatibilidade com medições antigas.
class MedicaoCreate(BaseModel):
    cliente: str
    maquina: str
    turno_inicio: str
    turno_fim: str
    velocidade_nominal: float
    producao_inicial: int
    maquina_linha_id: int | None = None


# Schema de atualização de medição. Usado ao finalizar — define produção final e timestamp.
class MedicaoUpdate(BaseModel):
    producao_final: int | None = None
    timestamp_fim: datetime | None = None


# Schema de resposta de medição. Retornado em todas as leituras de medições.
# Inclui a lista de eventos associados e o vínculo com a máquina da linha.
class MedicaoResponse(BaseModel):
    id: int
    cliente: str
    maquina: str
    turno_inicio: str
    turno_fim: str
    velocidade_nominal: float
    producao_inicial: int
    producao_final: int | None
    timestamp_inicio: datetime
    timestamp_fim: datetime | None
    maquina_linha_id: int | None = None
    linha_id: int | None = None
    eventos: list[EventoResponse] = []

    model_config = {"from_attributes": True}