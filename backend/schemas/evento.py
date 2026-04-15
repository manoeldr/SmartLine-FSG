from datetime import datetime
from pydantic import BaseModel


class EventoCreate(BaseModel):
    tipo: str
    motivo: str | None = None
    producao_leitura: int | None = None


class EventoResponse(BaseModel):
    id: int
    medicao_id: int
    tipo: str
    timestamp: datetime
    motivo: str | None = None
    producao_leitura: int | None = None
    foto_path: str | None = None

    model_config = {"from_attributes": True}