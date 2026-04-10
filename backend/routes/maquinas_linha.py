from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.maquina_linha import MaquinaLinha
from backend.models.linha import Linha
from backend.models.medicao import Medicao
from backend.models.usuario import Usuario
from backend.schemas.maquina_linha import MaquinaLinhaCreate, MaquinaLinhaUpdate, MaquinaLinhaResponse

router = APIRouter(prefix="/linhas/{linha_id}/maquinas", tags=["maquinas"])


# Cria uma nova máquina vinculada a uma linha. Valida se a linha existe antes de inserir.
@router.post("/", response_model=MaquinaLinhaResponse)
def criar_maquina(linha_id: int, dados: MaquinaLinhaCreate, db: Session = Depends(get_db)):
    linha = db.query(Linha).filter(Linha.id == linha_id).first()
    if not linha:
        raise HTTPException(status_code=404, detail="Linha não encontrada")
    multiplicador = getattr(dados, 'multiplicador_produto', None) if hasattr(dados, 'multiplicador_produto') else None
    maquina = MaquinaLinha(
        nome=dados.nome,
        ordem=dados.ordem,
        linha_id=linha_id,
        multiplicador_produto=multiplicador if multiplicador is not None else 1
    )
    db.add(maquina)
    db.commit()
    db.refresh(maquina)
    return maquina


# Retorna todas as máquinas de uma linha, ordenadas pelo campo `ordem`.
@router.get("/", response_model=list[MaquinaLinhaResponse])
def listar_maquinas(linha_id: int, db: Session = Depends(get_db)):
    linha = db.query(Linha).filter(Linha.id == linha_id).first()
    if not linha:
        raise HTTPException(status_code=404, detail="Linha não encontrada")
    return db.query(MaquinaLinha).filter(MaquinaLinha.linha_id == linha_id).order_by(MaquinaLinha.ordem).all()


# Retorna todas as máquinas da linha com status de ocupação.
# Para cada máquina ocupada, retorna o nome do auditor que está medindo.
# Usado no modal de início de medição para mostrar quem está em cada máquina.
@router.get("/ocupacao")
def ocupacao_maquinas(linha_id: int, db: Session = Depends(get_db)):
    linha = db.query(Linha).filter(Linha.id == linha_id).first()
    if not linha:
        raise HTTPException(status_code=404, detail="Linha não encontrada")

    maquinas = db.query(MaquinaLinha).filter(
        MaquinaLinha.linha_id == linha_id
    ).order_by(MaquinaLinha.ordem).all()

    # Busca medições ativas (sem timestamp_fim) para cada máquina
    medicoes_ativas = db.query(Medicao).filter(
        Medicao.maquina_linha_id.in_([m.id for m in maquinas]),
        Medicao.timestamp_fim.is_(None)
    ).all()

    # Monta dict: maquina_id -> medicao ativa
    ocupacao = {m.maquina_linha_id: m for m in medicoes_ativas}

    resultado = []
    for maquina in maquinas:
        medicao_ativa = ocupacao.get(maquina.id)
        auditor_nome = None

        if medicao_ativa:
            # Tenta buscar o nome do auditor pelo campo `maquina` da medição
            # (que armazena o nome da máquina, não do usuário — usamos o campo cliente como fallback)
            auditor_nome = medicao_ativa.usuario_nome or medicao_ativa.cliente or "Em medição"

        resultado.append({
            "id": maquina.id,
            "nome": maquina.nome,
            "ordem": maquina.ordem,
            "linha_id": maquina.linha_id,
            "velocidade_nominal": maquina.velocidade_nominal,
            "sobrevelocidade": maquina.sobrevelocidade,
            "multiplicador_produto": maquina.multiplicador_produto,
            "alarmes": maquina.alarmes,
            "critica": maquina.critica,
            "ocupada": medicao_ativa is not None,
            "auditor": auditor_nome,
        })

    return resultado


# Retorna apenas as máquinas sem medição ativa no momento.
# Usado na tela de Medição para listar quais máquinas o auditor pode assumir.
@router.get("/disponiveis", response_model=list[MaquinaLinhaResponse])
def listar_maquinas_disponiveis(linha_id: int, db: Session = Depends(get_db)):
    linha = db.query(Linha).filter(Linha.id == linha_id).first()
    if not linha:
        raise HTTPException(status_code=404, detail="Linha não encontrada")

    maquinas_ocupadas = db.query(Medicao.maquina_linha_id).filter(
        Medicao.maquina_linha_id.isnot(None),
        Medicao.timestamp_fim.is_(None)
    ).subquery()

    return db.query(MaquinaLinha).filter(
        MaquinaLinha.linha_id == linha_id,
        MaquinaLinha.id.notin_(maquinas_ocupadas)
    ).order_by(MaquinaLinha.ordem).all()


# Atualiza campos de uma máquina (nome, ordem, velocidade nominal, alarmes, multiplicador, crítica).
# Ao marcar uma máquina como crítica, desmarca automaticamente as demais da mesma linha.
@router.patch("/{maquina_id}", response_model=MaquinaLinhaResponse)
def atualizar_maquina(linha_id: int, maquina_id: int, dados: MaquinaLinhaUpdate, db: Session = Depends(get_db)):
    maquina = db.query(MaquinaLinha).filter(MaquinaLinha.id == maquina_id, MaquinaLinha.linha_id == linha_id).first()
    if not maquina:
        raise HTTPException(status_code=404, detail="Máquina não encontrada")
    if dados.nome is not None:
        maquina.nome = dados.nome
    if dados.ordem is not None:
        maquina.ordem = dados.ordem
    if dados.velocidade_nominal is not None:
        maquina.velocidade_nominal = dados.velocidade_nominal
    if dados.sobrevelocidade is not None:
        maquina.sobrevelocidade = dados.sobrevelocidade
    if dados.alarmes is not None:
        maquina.alarmes = dados.alarmes
    if hasattr(dados, 'multiplicador_produto') and dados.multiplicador_produto is not None:
        maquina.multiplicador_produto = dados.multiplicador_produto
    if dados.critica is not None:
        if dados.critica:
            db.query(MaquinaLinha).filter(
                MaquinaLinha.linha_id == linha_id,
                MaquinaLinha.id != maquina_id
            ).update({"critica": False})
        maquina.critica = dados.critica
    db.commit()
    db.refresh(maquina)
    return maquina


# Remove uma máquina da linha.
@router.delete("/{maquina_id}")
def deletar_maquina(linha_id: int, maquina_id: int, db: Session = Depends(get_db)):
    maquina = db.query(MaquinaLinha).filter(MaquinaLinha.id == maquina_id, MaquinaLinha.linha_id == linha_id).first()
    if not maquina:
        raise HTTPException(status_code=404, detail="Máquina não encontrada")
    db.delete(maquina)
    db.commit()
    return {"ok": True}