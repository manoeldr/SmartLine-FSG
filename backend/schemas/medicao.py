from datetime import datetime
from pydantic import BaseModel
from .evento import EventoResponse

class MedicaoCreate(BaseModel):
    cliente: str
    maquina: str
    turno_inicio: str
    turno_fim: str
    velocidade_nominal: float
    producao_inicial: int
    maquina_linha_id: int | None = None

class MedicaoUpdate(BaseModel):
    producao_final: int | None = None
    timestamp_fim: datetime | None = None

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
    eventos: list[EventoResponse] = []

    model_config = {"from_attributes": True}