from pydantic import BaseModel

class MaquinaLinhaCreate(BaseModel):
    nome: str
    ordem: int
    linha_id: int

class MaquinaLinhaUpdate(BaseModel):
    nome: str | None = None
    ordem: int | None = None

class MaquinaLinhaResponse(BaseModel):
    id: int
    nome: str
    ordem: int
    linha_id: int

    model_config = {"from_attributes": True}
    