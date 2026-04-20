from pydantic import BaseModel
from typing import Optional


class WiseDeviceCreate(BaseModel):
    ip: str
    posicao: str
    ordem: int = 1
    ativo: bool = True
    usuario: str = "root"
    senha: Optional[str] = None


class WiseDeviceUpdate(BaseModel):
    ip: Optional[str] = None
    posicao: Optional[str] = None
    ordem: Optional[int] = None
    ativo: Optional[bool] = None
    usuario: Optional[str] = None
    senha: Optional[str] = None


class WiseDeviceResponse(BaseModel):
    id: int
    maquina_linha_id: int
    ip: str
    posicao: str
    ordem: int
    ativo: bool
    usuario: str
    senha: Optional[str] = None

    model_config = {"from_attributes": True}