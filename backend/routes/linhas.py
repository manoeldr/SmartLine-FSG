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
from backend.calculations import calcular_indicadores

router = APIRouter(prefix="/linhas", tags=["linhas"])


# Cria uma nova linha de produção vinculada a um cliente.
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


# Retorna todas as linhas. Aceita filtro opcional por cliente_id.
@router.get("/", response_model=list[LinhaResponse])
def listar_linhas(cliente_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(Linha)
    if cliente_id:
        query = query.filter(Linha.cliente_id == cliente_id)
    return query.all()


# Retorna uma linha específica pelo ID.
@router.get("/{linha_id}", response_model=LinhaResponse)
def buscar_linha(linha_id: int, db: Session = Depends(get_db)):
    linha = db.query(Linha).filter(Linha.id == linha_id).first()
    if not linha:
        raise HTTPException(status_code=404, detail="Linha não encontrada")
    return linha


# Retorna o status em tempo real de cada máquina da linha.
# Usa calculations.py como fonte única dos cálculos.
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
        # Busca medição ativa primeiro
        medicao = db.query(Medicao).filter(
            Medicao.maquina_linha_id == m.id,
            Medicao.timestamp_fim.is_(None)
        ).first()

        estado_base = "rodando"

        if not medicao:
            # Sem medição ativa — busca a última finalizada
            medicao = db.query(Medicao).filter(
                Medicao.maquina_linha_id == m.id,
                Medicao.timestamp_fim.isnot(None)
            ).order_by(Medicao.timestamp_fim.desc()).first()

            if not medicao:
                resultado.append({
                    "maquina_id": m.id,
                    "maquina_nome": m.nome,
                    "ordem": m.ordem,
                    "critica": m.critica,
                    "estado": "sem_informacao",
                    "eficiencia": None,
                    "producao": None,
                    "velocidade": m.velocidade_nominal,
                    "tempo_parado_ms": None,
                    "mtbf_ms": None,
                    "mttr_ms": None,
                })
                continue

            estado_base = "ultima_medicao"

        eventos = db.query(Evento).filter(
            Evento.medicao_id == medicao.id
        ).order_by(Evento.timestamp).all()

        ind = calcular_indicadores(
            eventos=eventos,
            timestamp_inicio=medicao.timestamp_inicio,
            timestamp_fim=medicao.timestamp_fim,
            producao_inicial=medicao.producao_inicial or 0,
            velocidade_nominal=medicao.velocidade_nominal or m.velocidade_nominal or 1,
        )

        # Estado: última medição tem prioridade, senão usa o estado calculado
        estado = estado_base if estado_base == "ultima_medicao" else ind["ultimo_estado"]

        resultado.append({
            "maquina_id": m.id,
            "maquina_nome": m.nome,
            "ordem": m.ordem,
            "critica": m.critica,
            "estado": estado,
            "eficiencia": ind["eficiencia"],
            "producao": ind["producao"],
            "velocidade": m.velocidade_nominal,
            "tempo_parado_ms": ind["stopped_ms"],
            "mtbf_ms": ind["mtbf_ms"],
            "mttr_ms": ind["mttr_ms"],
        })

    return resultado


# Retorna dados agregados da linha para o Dashboard.
# Usa calculations.py como fonte única dos cálculos.
@router.get("/{linha_id}/dashboard")
def dashboard_linha(linha_id: int, db: Session = Depends(get_db)):
    linha = db.query(Linha).filter(Linha.id == linha_id).first()
    if not linha:
        raise HTTPException(status_code=404, detail="Linha não encontrada")

    maquinas = db.query(MaquinaLinha).filter(
        MaquinaLinha.linha_id == linha_id
    ).order_by(MaquinaLinha.ordem).all()

    eficiencias = []
    total_paradas = 0
    total_stopped_ms = 0
    total_running_ms = 0
    producao_critica = None
    velocidade_critica = None
    estado_critica = "sem_informacao"
    maquinas_ativas = 0

    for m in maquinas:
        medicao = db.query(Medicao).filter(
            Medicao.maquina_linha_id == m.id,
            Medicao.timestamp_fim.is_(None)
        ).first()

        if not medicao:
            continue

        maquinas_ativas += 1

        eventos = db.query(Evento).filter(
            Evento.medicao_id == medicao.id
        ).order_by(Evento.timestamp).all()

        ind = calcular_indicadores(
            eventos=eventos,
            timestamp_inicio=medicao.timestamp_inicio,
            timestamp_fim=medicao.timestamp_fim,
            producao_inicial=medicao.producao_inicial or 0,
            velocidade_nominal=medicao.velocidade_nominal or m.velocidade_nominal or 1,
        )

        eficiencias.append(ind["eficiencia"])
        total_paradas += ind["num_paradas"]
        total_stopped_ms += ind["stopped_ms"]
        total_running_ms += ind["running_ms"]

        if m.critica:
            estado_critica = ind["ultimo_estado"]
            velocidade_critica = m.velocidade_nominal
            producao_critica = ind["producao"]

    eficiencia_media = round(sum(eficiencias) / len(eficiencias), 1) if eficiencias else None
    mtbf_medio = round(total_running_ms / total_paradas) if total_paradas > 0 else None
    mttr_medio = round(total_stopped_ms / total_paradas) if total_paradas > 0 else None

    return {
        "linha_id": linha_id,
        "maquinas_ativas": maquinas_ativas,
        "maquinas_total": len(maquinas),
        "estado_critica": estado_critica,
        "producao_critica": producao_critica,
        "velocidade_critica": velocidade_critica,
        "eficiencia_media": eficiencia_media,
        "total_paradas": total_paradas,
        "mtbf_medio_ms": mtbf_medio,
        "mttr_medio_ms": mttr_medio,
    }