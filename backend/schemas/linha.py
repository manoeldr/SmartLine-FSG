from pydantic import BaseModel

class LinhaCreate(BaseModel):
    nome: str
    cliente_id: int

class LinhaResponse(BaseModel):
    id: int
    nome: str
    cliente_id: int

    model_config = {"from_attributes": True}