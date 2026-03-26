from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.medicao import Medicao
from backend.schemas.medicao import MedicaoCreate, MedicaoUpdate, MedicaoResponse
from datetime import datetime

router = APIRouter(prefix="/medicoes", tags=["medicoes"])

@router.post("/", response_model=MedicaoResponse)
def criar_medicao(dados: MedicaoCreate, db: Session = Depends(get_db)):
    medicao = Medicao(**dados.model_dump())
    db.add(medicao)
    db.commit()
    db.refresh(medicao)
    return medicao

@router.get("/", response_model=list[MedicaoResponse])
def listar_medicoes(db: Session = Depends(get_db)):
    return db.query(Medicao).all()

@router.get("/{medicao_id}", response_model=MedicaoResponse)
def buscar_medicao(medicao_id: int, db: Session = Depends(get_db)):
    medicao = db.query(Medicao).filter(Medicao.id == medicao_id).first()
    if not medicao:
        raise HTTPException(status_code=404, detail="Medição não encontrada")
    return medicao

@router.patch("/{medicao_id}/finalizar", response_model=MedicaoResponse)
def finalizar_medicao(medicao_id: int, dados: MedicaoUpdate, db: Session = Depends(get_db)):
    medicao = db.query(Medicao).filter(Medicao.id == medicao_id).first()
    if not medicao:
        raise HTTPException(status_code=404, detail="Medição não encontrada")
    if medicao.timestamp_fim:
        raise HTTPException(status_code=400, detail="Medição já finalizada")
    if dados.producao_final is not None:
        medicao.producao_final = dados.producao_final
    medicao.timestamp_fim = dados.timestamp_fim or datetime.now()
    db.commit()
    db.refresh(medicao)
    return medicao