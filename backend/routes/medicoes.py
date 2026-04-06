from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

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
def listar_medicoes(
    linha_id: Optional[int] = None,
    maquina_linha_id: Optional[int] = None,
    cliente: Optional[str] = None,
    turno_inicio: Optional[str] = None,
    data_inicio: Optional[str] = None,
    data_fim: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Medicao)

    if maquina_linha_id:
        query = query.filter(Medicao.maquina_linha_id == maquina_linha_id)
    elif linha_id:
        from backend.models.maquina_linha import MaquinaLinha
        maquinas = db.query(MaquinaLinha.id).filter(MaquinaLinha.linha_id == linha_id).subquery()
        query = query.filter(Medicao.maquina_linha_id.in_(maquinas))

    if cliente:
        query = query.filter(Medicao.cliente == cliente)

    if turno_inicio:
        query = query.filter(Medicao.turno_inicio == turno_inicio)

    if data_inicio:
        try:
            dt = datetime.strptime(data_inicio, "%Y-%m-%d")
            query = query.filter(Medicao.timestamp_inicio >= dt)
        except ValueError:
            pass

    if data_fim:
        try:
            from datetime import timedelta
            dt = datetime.strptime(data_fim, "%Y-%m-%d") + timedelta(days=1)
            query = query.filter(Medicao.timestamp_inicio < dt)
        except ValueError:
            pass

    query = query.options(selectinload(Medicao.eventos))
    return query.order_by(Medicao.timestamp_inicio.desc()).all()

@router.get("/filtros-disponiveis")
def filtros_disponiveis(linha_id: int, db: Session = Depends(get_db)):
    from backend.models.maquina_linha import MaquinaLinha

    # Busca medições vinculadas à linha via maquina_linha_id
    maquinas_ids = db.query(MaquinaLinha.id).filter(MaquinaLinha.linha_id == linha_id).subquery()
    medicoes = db.query(Medicao).filter(
        Medicao.maquina_linha_id.in_(maquinas_ids)
    ).all()

    # Fallback: se não houver nenhuma vinculada, busca todas
    if not medicoes:
        medicoes = db.query(Medicao).all()

    clientes = sorted(set(m.cliente for m in medicoes if m.cliente))
    turnos = sorted(set(m.turno_inicio for m in medicoes if m.turno_inicio))
    datas = sorted(set(
        m.timestamp_inicio.strftime("%Y-%m-%d") for m in medicoes if m.timestamp_inicio
    ), reverse=True)

    return {
        "clientes": clientes,
        "turnos": turnos,
        "datas": datas,
    }

@router.get("/{medicao_id}", response_model=MedicaoResponse)
def buscar_medicao(medicao_id: int, db: Session = Depends(get_db)):
    medicao = db.query(Medicao).options(selectinload(Medicao.eventos)).filter(Medicao.id == medicao_id).first()
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