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


# Cria uma nova linha de produção vinculada a um cliente.
# Valida se o cliente existe antes de inserir.
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


# Retorna uma linha específica pelo ID. Retorna 404 se não encontrada.
@router.get("/{linha_id}", response_model=LinhaResponse)
def buscar_linha(linha_id: int, db: Session = Depends(get_db)):
    linha = db.query(Linha).filter(Linha.id == linha_id).first()
    if not linha:
        raise HTTPException(status_code=404, detail="Linha não encontrada")
    return linha


# Retorna o status em tempo real de cada máquina da linha.
# Para cada máquina: estado (rodando/parado/sem_informacao/ultima_medicao),
# eficiência, produção, tempo parado, MTBF e MTTR.
# Usado pelo fluxo visual e pelos cards detalhados no overview.
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
        medicao = db.query(Medicao).filter(
            Medicao.maquina_linha_id == m.id,
            Medicao.timestamp_fim.is_(None)
        ).first()

        if not medicao:
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

            estado = "ultima_medicao"
        else:
            estado = None

        from datetime import datetime
        agora = datetime.now()
        inicio = medicao.timestamp_inicio
        fim = medicao.timestamp_fim or agora
        elapsed_ms = (fim - inicio).total_seconds() * 1000

        eventos = db.query(Evento).filter(
            Evento.medicao_id == medicao.id
        ).order_by(Evento.timestamp).all()

        stopped_ms = 0
        stop_time = None
        ultimo_estado = "rodando"
        num_paradas = 0

        for ev in eventos:
            if ev.tipo == "parada":
                stop_time = ev.timestamp
                ultimo_estado = "parado"
                num_paradas += 1
            elif ev.tipo == "marcha" and stop_time:
                stopped_ms += (ev.timestamp - stop_time).total_seconds() * 1000
                stop_time = None
                ultimo_estado = "rodando"

        if stop_time and estado != "ultima_medicao":
            stopped_ms += (agora - stop_time).total_seconds() * 1000

        running_ms = max(0, elapsed_ms - stopped_ms)
        eficiencia = round((running_ms / elapsed_ms * 100), 1) if elapsed_ms > 0 else 0

        producao = None
        if medicao.producao_final is not None and medicao.producao_inicial is not None:
            producao = medicao.producao_final - medicao.producao_inicial
        elif medicao.producao_inicial is not None:
            producao_eventos = [e for e in eventos if e.tipo == "production" and e.producao_leitura]
            if producao_eventos:
                producao = producao_eventos[-1].producao_leitura - medicao.producao_inicial

        mtbf_ms = (running_ms / num_paradas) if num_paradas > 0 else None
        mttr_ms = (stopped_ms / num_paradas) if num_paradas > 0 else None

        if estado != "ultima_medicao":
            estado = ultimo_estado

        resultado.append({
            "maquina_id": m.id,
            "maquina_nome": m.nome,
            "ordem": m.ordem,
            "critica": m.critica,
            "estado": estado,
            "eficiencia": eficiencia,
            "producao": producao,
            "velocidade": m.velocidade_nominal,
            "tempo_parado_ms": round(stopped_ms),
            "mtbf_ms": round(mtbf_ms) if mtbf_ms else None,
            "mttr_ms": round(mttr_ms) if mttr_ms else None,
        })

    return resultado


# Retorna dados agregados da linha para o Dashboard.
# Produção e OEE vêm da máquina crítica.
# Eficiência, paradas, MTBF e MTTR são calculados de todas as máquinas com medição ativa.
@router.get("/{linha_id}/dashboard")
def dashboard_linha(linha_id: int, db: Session = Depends(get_db)):
    linha = db.query(Linha).filter(Linha.id == linha_id).first()
    if not linha:
        raise HTTPException(status_code=404, detail="Linha não encontrada")

    maquinas = db.query(MaquinaLinha).filter(
        MaquinaLinha.linha_id == linha_id
    ).order_by(MaquinaLinha.ordem).all()

    from datetime import datetime
    agora = datetime.now()

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
        inicio = medicao.timestamp_inicio
        elapsed_ms = (agora - inicio).total_seconds() * 1000

        eventos = db.query(Evento).filter(
            Evento.medicao_id == medicao.id
        ).order_by(Evento.timestamp).all()

        stopped_ms = 0
        stop_time = None
        ultimo_estado = "rodando"
        num_paradas = 0

        for ev in eventos:
            if ev.tipo == "parada":
                stop_time = ev.timestamp
                ultimo_estado = "parado"
                num_paradas += 1
            elif ev.tipo == "marcha" and stop_time:
                stopped_ms += (ev.timestamp - stop_time).total_seconds() * 1000
                stop_time = None
                ultimo_estado = "rodando"

        if stop_time:
            stopped_ms += (agora - stop_time).total_seconds() * 1000

        running_ms = max(0, elapsed_ms - stopped_ms)
        eficiencia = (running_ms / elapsed_ms * 100) if elapsed_ms > 0 else 0

        eficiencias.append(eficiencia)
        total_paradas += num_paradas
        total_stopped_ms += stopped_ms
        total_running_ms += running_ms

        # Dados da máquina crítica
        if m.critica:
            estado_critica = ultimo_estado
            velocidade_critica = m.velocidade_nominal
            if medicao.producao_final is not None and medicao.producao_inicial is not None:
                producao_critica = medicao.producao_final - medicao.producao_inicial
            elif medicao.producao_inicial is not None:
                producao_eventos = [e for e in eventos if e.tipo == "production" and e.producao_leitura]
                if producao_eventos:
                    producao_critica = producao_eventos[-1].producao_leitura - medicao.producao_inicial

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