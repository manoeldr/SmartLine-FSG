import os
import uuid
import jwt
import bcrypt
from datetime import datetime
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from backend.database import get_db

# ============================================================
# AUTH.PY — Autenticação JWT + hash de senha
# SECRET_KEY gerada dinamicamente a cada start do servidor.
# Isso invalida todos os tokens quando o servidor reinicia.
# ============================================================

# Gerada uma vez por processo — muda a cada restart do servidor
SECRET_KEY = str(uuid.uuid4())
ALGORITHM = "HS256"

bearer_scheme = HTTPBearer()


# Gera o hash bcrypt de uma senha em texto plano.
def hash_senha(senha: str) -> str:
    return bcrypt.hashpw(senha.encode(), bcrypt.gensalt()).decode()


# Verifica se a senha em texto plano corresponde ao hash armazenado.
def verificar_senha(senha: str, hash: str) -> bool:
    return bcrypt.checkpw(senha.encode(), hash.encode())


# Gera um token JWT sem expiração para o usuário informado.
# O token é invalidado automaticamente quando o servidor reinicia
# pois a SECRET_KEY é regenerada.
def criar_token(usuario_id: int, nivel: str) -> str:
    payload = {
        "sub": str(usuario_id),
        "nivel": nivel,
        "iat": datetime.utcnow().timestamp(),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# Decodifica e valida o token JWT. Retorna o payload se válido.
# Lança 401 se o token for inválido ou expirado.
def decodificar_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado"
        )


# Dependency que extrai e valida o token do header Authorization.
# Retorna o payload do token se válido.
def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> dict:
    return decodificar_token(credentials.credentials)


# Dependency que exige nível admin.
def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("nivel") != "admin":
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores")
    return user


# Dependency que exige nível admin ou auditor.
def require_auditor(user: dict = Depends(get_current_user)) -> dict:
    if user.get("nivel") not in ("admin", "auditor"):
        raise HTTPException(status_code=403, detail="Acesso restrito a auditores")
    return user