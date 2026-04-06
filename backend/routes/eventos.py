from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.evento import Evento
from backend.models.medicao import Medicao
from backend.schemas.evento import EventoCreate, EventoResponse

router = APIRouter(prefix="/medicoes/{medicao_id}/eventos", tags=["eventos"])

@router.post("/", response_model=EventoResponse)
def registrar_evento(medicao_id: int, dados: EventoCreate, db: Session = Depends(get_db)):
    medicao = db.query(Medicao).filter(Medicao.id == medicao_id).first()
    if not medicao:
        raise HTTPException(status_code=404, detail="Medição não encontrada")
    if medicao.timestamp_fim:
        raise HTTPException(status_code=400, detail="Medição já finalizada")
    if dados.tipo not in ("marcha", "parada", "producao"):
        raise HTTPException(status_code=422, detail="Tipo deve ser 'marcha', 'parada' ou 'producao'")

    evento = Evento(medicao_id=medicao_id, **dados.model_dump())
    db.add(evento)
    db.commit()
    db.refresh(evento)
    return evento

@router.get("/", response_model=list[EventoResponse])
def listar_eventos(medicao_id: int, db: Session = Depends(get_db)):
    medicao = db.query(Medicao).filter(Medicao.id == medicao_id).first()
    if not medicao:
        raise HTTPException(status_code=404, detail="Medição não encontrada")
    return db.query(Evento).filter(Evento.medicao_id == medicao_id).all()