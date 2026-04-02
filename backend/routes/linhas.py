from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from sqlalchemy.orm import Session

from backend.database import get_db

from backend.models.linha import Linha
from backend.models.cliente import Cliente
from backend.models.maquina_linha import MaquinaLinha
from backend.models.medicao import Medicao
from backend.models.evento import Evento


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
def listar_linhas(cliente_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(Linha)
    if cliente_id:
        query = query.filter(Linha.cliente_id == cliente_id)
    return query.all()

@router.get("/{linha_id}", response_model=LinhaResponse)
def buscar_linha(linha_id: int, db: Session = Depends(get_db)):
    linha = db.query(Linha).filter(Linha.id == linha_id).first()
    if not linha:
        raise HTTPException(status_code=404, detail="Linha não encontrada")
    return linha

@router.get("/{linha_id}/status")
def status_linha(linha_id: int, db: Session = Depends(get_db)):
    linha = db.query(Linha).filter(Linha.id == linha_id).first()
    if not linha:
        raise HTTPException(status_code=404, detail="Linha não encontrada")

    maquinas = db.query(MaquinaLinha).filter(
        MaquinaLinha.linha_id == linha_id
    ).order_by(MaquinaLinha.ordem).all()

    resultado = []
    for m in maquinas:
        # Busca medição ativa desta máquina
        medicao = db.query(Medicao).filter(
            Medicao.maquina_linha_id == m.id,
            Medicao.timestamp_fim.is_(None)
        ).first()

        if not medicao:
            resultado.append({
                "maquina_id": m.id,
                "maquina_nome": m.nome,
                "ordem": m.ordem,
                "estado": "sem_medicao",
                "eficiencia": None,
            })
            continue

        # Calcula eficiência baseado nos eventos
        eventos = db.query(Evento).filter(
            Evento.medicao_id == medicao.id
        ).order_by(Evento.timestamp).all()

        from datetime import datetime
        agora = datetime.now()
        inicio = medicao.timestamp_inicio
        elapsed_ms = (agora - inicio).total_seconds() * 1000

        # Calcula tempo parado
        stopped_ms = 0
        stop_time = None
        ultimo_estado = "rodando"

        for ev in eventos:
            if ev.tipo == "parada":
                stop_time = ev.timestamp
                ultimo_estado = "parado"
            elif ev.tipo == "marcha" and stop_time:
                stopped_ms += (ev.timestamp - stop_time).total_seconds() * 1000
                stop_time = None
                ultimo_estado = "rodando"

        # Se ainda parado, conta até agora
        if stop_time:
            stopped_ms += (agora - stop_time).total_seconds() * 1000

        running_ms = max(0, elapsed_ms - stopped_ms)
        eficiencia = (running_ms / elapsed_ms * 100) if elapsed_ms > 0 else 0

        resultado.append({
            "maquina_id": m.id,
            "maquina_nome": m.nome,
            "ordem": m.ordem,
            "estado": ultimo_estado,
            "eficiencia": round(eficiencia, 1),
        })

    return resultado