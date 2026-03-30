from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.cliente import Cliente
from backend.schemas.cliente import ClienteCreate, ClienteResponse

router = APIRouter(prefix="/clientes", tags=["clientes"])

@router.post("/", response_model=ClienteResponse)
def criar_cliente(dados: ClienteCreate, db: Session = Depends(get_db)):
    existente = db.query(Cliente).filter(Cliente.nome == dados.nome).first()
    if existente:
        raise HTTPException(status_code=400, detail="Cliente já cadastrado")
    cliente = Cliente(**dados.model_dump())
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return cliente

@router.get("/", response_model=list[ClienteResponse])
def listar_clientes(db: Session = Depends(get_db)):
    return db.query(Cliente).all()

@router.get("/{cliente_id}", response_model=ClienteResponse)
def buscar_cliente(cliente_id: int, db: Session = Depends(get_db)):
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return cliente