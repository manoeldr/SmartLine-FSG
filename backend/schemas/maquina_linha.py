from pydantic import BaseModel


# Schema de criação de máquina. Recebe os dados mínimos ao adicionar uma máquina à linha.
class MaquinaLinhaCreate(BaseModel):
    nome: str
    ordem: int
    linha_id: int


# Schema de atualização de máquina. Todos os campos são opcionais — atualiza apenas o que for enviado.
# critica: ao marcar True, o backend desmarca automaticamente as demais da linha.
class MaquinaLinhaUpdate(BaseModel):
    nome: str | None = None
    ordem: int | None = None
    velocidade_nominal: float | None = None
    sobrevelocidade: float | None = None
    multiplicador_produto: float | None = None
    alarmes: str | None = None
    critica: bool | None = None


# Schema de resposta de máquina. Retornado em todas as leituras de máquinas da linha.
class MaquinaLinhaResponse(BaseModel):
    id: int
    nome: str
    ordem: int
    linha_id: int
    velocidade_nominal: float | None = None
    sobrevelocidade: float | None = None
    multiplicador_produto: float | None = None
    alarmes: str | None = None
    critica: bool = False

    model_config = {"from_attributes": True}