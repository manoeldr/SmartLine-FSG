from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from backend.database import get_db
from backend.models.medicao import Medicao
from backend.models.evento import Evento
from backend.schemas.medicao import MedicaoCreate, MedicaoUpdate, MedicaoResponse

from datetime import datetime

router = APIRouter(prefix="/medicoes", tags=["medicoes"])


# Cria uma nova medição com os dados do auditor (cliente, máquina, turno, produção inicial).
# Retorna a medição criada com o ID gerado pelo banco.
@router.post("/", response_model=MedicaoResponse)
def criar_medicao(dados: MedicaoCreate, db: Session = Depends(get_db)):
    medicao = Medicao(**dados.model_dump())
    db.add(medicao)
    db.commit()
    db.refresh(medicao)
    return medicao


# Lista medições com filtros opcionais: linha, máquina, cliente, turno e intervalo de datas.
# Retorna em ordem decrescente de data de início.
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

    query = query.options(selectinload(Medicao.eventos), selectinload(Medicao.maquina_linha))
    return query.order_by(Medicao.timestamp_inicio.desc()).all()


# Retorna os valores disponíveis para os filtros do overview:
# lista de clientes, turnos e datas com medições registradas na linha.
# Faz fallback para todas as medições se nenhuma estiver vinculada à linha.
@router.get("/filtros-disponiveis")
def filtros_disponiveis(linha_id: int, db: Session = Depends(get_db)):
    from backend.models.maquina_linha import MaquinaLinha

    maquinas_ids = db.query(MaquinaLinha.id).filter(MaquinaLinha.linha_id == linha_id).subquery()
    medicoes = db.query(Medicao).filter(
        Medicao.maquina_linha_id.in_(maquinas_ids)
    ).all()

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


# Retorna a medição ativa de uma máquina específica, junto com todos os seus eventos.
# Usado pelo frontend para recuperar o estado da medição após reinicialização do dispositivo.
# Retorna null se não houver medição ativa para a máquina.
@router.get("/ativa")
def medicao_ativa(maquina_linha_id: int, db: Session = Depends(get_db)):
    medicao = db.query(Medicao).filter(
        Medicao.maquina_linha_id == maquina_linha_id,
        Medicao.timestamp_fim.is_(None)
    ).first()
    if not medicao:
        return None
    eventos = db.query(Evento).filter(
        Evento.medicao_id == medicao.id
    ).order_by(Evento.timestamp).all()
    return {
        "medicao": {
            "id": medicao.id,
            "cliente": medicao.cliente,
            "maquina": medicao.maquina,
            "turno_inicio": medicao.turno_inicio,
            "turno_fim": medicao.turno_fim,
            "velocidade_nominal": medicao.velocidade_nominal,
            "producao_inicial": medicao.producao_inicial,
            "timestamp_inicio": medicao.timestamp_inicio.isoformat(),
            "maquina_linha_id": medicao.maquina_linha_id,
        },
        "eventos": [
            {
                "tipo": e.tipo,
                "timestamp": e.timestamp.isoformat(),
                "motivo": e.motivo,
                "producao_leitura": e.producao_leitura,
            }
            for e in eventos
        ]
    }


# Retorna uma medição específica pelo ID, incluindo seus eventos.
# Retorna 404 se não encontrada.
@router.get("/{medicao_id}", response_model=MedicaoResponse)
def buscar_medicao(medicao_id: int, db: Session = Depends(get_db)):
    medicao = db.query(Medicao).options(selectinload(Medicao.eventos)).filter(Medicao.id == medicao_id).first()
    if not medicao:
        raise HTTPException(status_code=404, detail="Medição não encontrada")
    return medicao


# Finaliza uma medição informando a produção final.
# Define o timestamp_fim como agora se não for fornecido.
# Retorna 400 se a medição já estiver finalizada.
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