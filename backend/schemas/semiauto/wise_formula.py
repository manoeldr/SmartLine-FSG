from pydantic import BaseModel
from typing import Optional


class WiseFormulaCreate(BaseModel):
    resultado: str      # "producao" ou "refugo"
    operacoes: str      # JSON: [{"posicao": "saida", "operacao": "+"}, ...]


class WiseFormulaUpdate(BaseModel):
    operacoes: Optional[str] = None


class WiseFormulaResponse(BaseModel):
    id: int
    maquina_linha_id: int
    resultado: str
    operacoes: str

    model_config = {"from_attributes": True}