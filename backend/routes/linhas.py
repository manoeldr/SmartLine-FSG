from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.linha import Linha
from backend.models.cliente import Cliente
from backend.schemas.linha import LinhaCreate, LinhaResponse

router = APIRouter(prefix="/linhas", tags=["linhas"])

@router.post("/", response_model=LinhaResponse)
def criar_linha(dados: LinhaCreate, db: Session = Depends(get_db)):
    cliente = db.query(Cliente).filter(Cliente.id == dados.cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    linha = Linha(**dados.model_dump())
    db.add(linha)
    db.commit()
    db.refresh(linha)
    return linha

@router.get("/", response_model=list[LinhaResponse])
def listar_linhas(db: Session = Depends(get_db)):
    return db.query(Linha).all()

@router.get("/{linha_id}", response_model=LinhaResponse)
def buscar_linha(linha_id: int, db: Session = Depends(get_db)):
    linha = db.query(Linha).filter(Linha.id == linha_id).first()
    if not linha:
        raise HTTPException(status_code=404, detail="Linha não encontrada")
    return linha

@router.get("/cliente/{cliente_id}", response_model=list[LinhaResponse])
def listar_linhas_por_cliente(cliente_id: int, db: Session = Depends(get_db)):
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return db.query(Linha).filter(Linha.cliente_id == cliente_id).all()