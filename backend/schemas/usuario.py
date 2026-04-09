from pydantic import BaseModel


# Schema de criação de usuário — usado pelo admin para cadastrar novos usuários.
class UsuarioCreate(BaseModel):
    nome: str
    login: str
    senha: str
    nivel: str = 'auditor'  # 'admin' | 'auditor' | 'cliente'


# Schema de resposta — nunca expõe a senha ou o hash.
class UsuarioResponse(BaseModel):
    id: int
    nome: str
    login: str
    nivel: str

    model_config = {"from_attributes": True}


# Schema para login — recebe login e senha em texto plano.
class LoginRequest(BaseModel):
    login: str
    senha: str


# Schema de resposta do login — retorna o token JWT e dados básicos do usuário.
class LoginResponse(BaseModel):
    token: str
    usuario: UsuarioResponse