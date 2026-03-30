from pydantic import BaseModel

class ClienteCreate(BaseModel):
    nome: str

class ClienteResponse(BaseModel):
    id: int
    nome: str

    model_config = {"from_attributes": True}