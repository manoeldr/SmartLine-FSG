from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.maquina_linha import MaquinaLinha
from backend.models.linha import Linha
from backend.models.medicao import Medicao
from backend.schemas.maquina_linha import MaquinaLinhaCreate, MaquinaLinhaUpdate, MaquinaLinhaResponse

router = APIRouter(prefix="/linhas/{linha_id}/maquinas", tags=["maquinas"])

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

@router.get("/", response_model=list[MaquinaLinhaResponse])
def listar_maquinas(linha_id: int, db: Session = Depends(get_db)):
    linha = db.query(Linha).filter(Linha.id == linha_id).first()
    if not linha:
        raise HTTPException(status_code=404, detail="Linha não encontrada")
    return db.query(MaquinaLinha).filter(MaquinaLinha.linha_id == linha_id).order_by(MaquinaLinha.ordem).all()

@router.get("/disponiveis", response_model=list[MaquinaLinhaResponse])
def listar_maquinas_disponiveis(linha_id: int, db: Session = Depends(get_db)):
    linha = db.query(Linha).filter(Linha.id == linha_id).first()
    if not linha:
        raise HTTPException(status_code=404, detail="Linha não encontrada")
    
    # Busca IDs de máquinas que têm medição ativa no momento
    maquinas_ocupadas = db.query(Medicao.maquina_linha_id).filter(
        Medicao.maquina_linha_id.isnot(None),
        Medicao.timestamp_fim.is_(None)
    ).subquery()

    return db.query(MaquinaLinha).filter(
        MaquinaLinha.linha_id == linha_id,
        MaquinaLinha.id.notin_(maquinas_ocupadas)
    ).order_by(MaquinaLinha.ordem).all()

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
    if dados.alarmes is not None:
        maquina.alarmes = dados.alarmes
    if hasattr(dados, 'multiplicador_produto') and dados.multiplicador_produto is not None:
        maquina.multiplicador_produto = dados.multiplicador_produto
    db.commit()
    db.refresh(maquina)
    return maquina

@router.delete("/{maquina_id}")
def deletar_maquina(linha_id: int, maquina_id: int, db: Session = Depends(get_db)):
    maquina = db.query(MaquinaLinha).filter(MaquinaLinha.id == maquina_id, MaquinaLinha.linha_id == linha_id).first()
    if not maquina:
        raise HTTPException(status_code=404, detail="Máquina não encontrada")
    db.delete(maquina)
    db.commit()
    return {"ok": True}