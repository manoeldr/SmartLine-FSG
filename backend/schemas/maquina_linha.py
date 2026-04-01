from pydantic import BaseModel

class MaquinaLinhaCreate(BaseModel):
    nome: str
    ordem: int
    linha_id: int

class MaquinaLinhaUpdate(BaseModel):
    nome: str | None = None
    ordem: int | None = None
    velocidade_nominal: float | None = None
    multiplicador_produto: float | None = None
    alarmes: str | None = None  # JSON string

class MaquinaLinhaResponse(BaseModel):
    id: int
    nome: str
    ordem: int
    linha_id: int
    velocidade_nominal: float | None = None
    multiplicador_produto: float | None = None
    alarmes: str | None = None

    model_config = {"from_attributes": True}