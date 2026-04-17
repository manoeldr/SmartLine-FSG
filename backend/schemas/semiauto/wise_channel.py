from pydantic import BaseModel
from typing import Optional


class WiseChannelCreate(BaseModel):
    numero_canal: int
    tipo: str           # "DI" ou "Counter"
    funcao: str         # "marcha_parada", "contagem" ou "alarme"
    alarme_motivo: Optional[str] = None
    ativo: bool = True


class WiseChannelUpdate(BaseModel):
    tipo: Optional[str] = None
    funcao: Optional[str] = None
    alarme_motivo: Optional[str] = None
    ativo: Optional[bool] = None


class WiseChannelResponse(BaseModel):
    id: int
    device_id: int
    numero_canal: int
    tipo: str
    funcao: str
    alarme_motivo: Optional[str] = None
    ativo: bool

    model_config = {"from_attributes": True}