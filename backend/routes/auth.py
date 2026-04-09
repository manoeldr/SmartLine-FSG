from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.usuario import Usuario
from backend.schemas.usuario import UsuarioCreate, UsuarioResponse, LoginRequest, LoginResponse
from backend.auth import hash_senha, verificar_senha, criar_token, require_admin, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


# Realiza o login do usuário. Verifica login e senha e retorna um token JWT.
# O token não tem expiração — é invalidado ao fechar a aba (sessionStorage no frontend)
# ou ao reiniciar o servidor (SECRET_KEY dinâmica).
@router.post("/login", response_model=LoginResponse)
def login(dados: LoginRequest, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.login == dados.login).first()
    if not usuario or not verificar_senha(dados.senha, usuario.senha_hash):
        raise HTTPException(status_code=401, detail="Login ou senha incorretos")
    token = criar_token(usuario.id, usuario.nivel)
    return {
        "token": token,
        "usuario": usuario,
    }


# Retorna os dados do usuário autenticado a partir do token.
# Usado pelo frontend para restaurar a sessão ao recarregar a página.
@router.get("/me", response_model=UsuarioResponse)
def me(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    usuario = db.query(Usuario).filter(Usuario.id == int(user["sub"])).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return usuario


# Cria um novo usuário. Restrito a administradores.
# A senha é armazenada como hash bcrypt — nunca em texto plano.
@router.post("/usuarios", response_model=UsuarioResponse)
def criar_usuario(dados: UsuarioCreate, db: Session = Depends(get_db), _: dict = Depends(require_admin)):
    if db.query(Usuario).filter(Usuario.login == dados.login).first():
        raise HTTPException(status_code=400, detail="Login já cadastrado")
    if dados.nivel not in ("admin", "auditor", "cliente"):
        raise HTTPException(status_code=422, detail="Nível deve ser admin, auditor ou cliente")
    usuario = Usuario(
        nome=dados.nome,
        login=dados.login,
        senha_hash=hash_senha(dados.senha),
        nivel=dados.nivel,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


# Lista todos os usuários. Restrito a administradores.
@router.get("/usuarios", response_model=list[UsuarioResponse])
def listar_usuarios(db: Session = Depends(get_db), _: dict = Depends(require_admin)):
    return db.query(Usuario).all()


# Deleta um usuário pelo ID. Restrito a administradores.
# Não permite deletar o próprio usuário logado.
@router.delete("/usuarios/{usuario_id}")
def deletar_usuario(usuario_id: int, db: Session = Depends(get_db), user: dict = Depends(require_admin)):
    if int(user["sub"]) == usuario_id:
        raise HTTPException(status_code=400, detail="Não é possível deletar o próprio usuário")
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    db.delete(usuario)
    db.commit()
    return {"ok": True}


# Altera a senha de um usuário. Admin pode alterar qualquer senha.
@router.patch("/usuarios/{usuario_id}/senha")
def alterar_senha(usuario_id: int, nova_senha: str, db: Session = Depends(get_db), _: dict = Depends(require_admin)):
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    usuario.senha_hash = hash_senha(nova_senha)
    db.commit()
    return {"ok": True}