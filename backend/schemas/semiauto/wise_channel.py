from pydantic import BaseModel
from typing import Optional


# Schema para criação de um novo canal num dispositivo WISE.
# tipo e funcao são obrigatórios e validados na rota.
# tempo_sem_alteracao_segundos só é relevante quando funcao = "marcha_parada" —
# define quantos segundos o sinal precisa ficar estático para gerar evento de parada.
class WiseChannelCreate(BaseModel):
    numero_canal: int
    tipo: str                                           # "DI" ou "Counter"
    funcao: str                                         # "marcha_parada", "contagem" ou "alarme"
    alarme_motivo: Optional[str] = None                 # Obrigatório quando funcao = "alarme"
    tempo_sem_alteracao_segundos: Optional[int] = 30    # Usado quando funcao = "marcha_parada"
    ativo: bool = True


# Schema para atualização parcial de um canal.
# Todos os campos são opcionais — apenas os informados serão atualizados.
class WiseChannelUpdate(BaseModel):
    tipo: Optional[str] = None
    funcao: Optional[str] = None
    alarme_motivo: Optional[str] = None
    tempo_sem_alteracao_segundos: Optional[int] = None
    ativo: Optional[bool] = None


# Schema de resposta de um canal do WISE.
# Retornado em todas as operações de leitura e escrita.
class WiseChannelResponse(BaseModel):
    id: int
    device_id: int
    numero_canal: int
    tipo: str
    funcao: str
    alarme_motivo: Optional[str] = None
    tempo_sem_alteracao_segundos: Optional[int] = None
    ativo: bool

    model_config = {"from_attributes": True}