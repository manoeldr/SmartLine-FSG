from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db

from backend.models.maquina_linha import MaquinaLinha
from backend.models.semiauto.wise_formula import WiseFormula

from backend.schemas.semiauto.wise_formula import WiseFormulaCreate, WiseFormulaUpdate, WiseFormulaResponse

router = APIRouter(prefix="/linhas/{linha_id}/maquinas/{maquina_id}/wise/formulas", tags=["wise_formulas"])


def _validar_maquina(linha_id: int, maquina_id: int, db: Session) -> MaquinaLinha:
    maquina = db.query(MaquinaLinha).filter(
        MaquinaLinha.id == maquina_id,
        MaquinaLinha.linha_id == linha_id,
    ).first()
    if not maquina:
        raise HTTPException(status_code=404, detail="Máquina não encontrada")
    return maquina


# Lista todas as fórmulas configuradas para uma máquina.
@router.get("/", response_model=list[WiseFormulaResponse])
def listar_formulas(linha_id: int, maquina_id: int, db: Session = Depends(get_db)):
    _validar_maquina(linha_id, maquina_id, db)
    return db.query(WiseFormula).filter(
        WiseFormula.maquina_linha_id == maquina_id
    ).all()


# Cria ou substitui uma fórmula para um tipo de resultado (producao, refugo).
# Se já existir fórmula para aquele resultado, ela é substituída.
@router.post("/", response_model=WiseFormulaResponse)
def salvar_formula(linha_id: int, maquina_id: int, dados: WiseFormulaCreate, db: Session = Depends(get_db)):
    _validar_maquina(linha_id, maquina_id, db)

    if dados.resultado not in ("producao", "refugo"):
        raise HTTPException(status_code=422, detail="Resultado deve ser 'producao' ou 'refugo'")

    existente = db.query(WiseFormula).filter(
        WiseFormula.maquina_linha_id == maquina_id,
        WiseFormula.resultado == dados.resultado,
    ).first()

    if existente:
        existente.operacoes = dados.operacoes
        db.commit()
        db.refresh(existente)
        return existente

    formula = WiseFormula(maquina_linha_id=maquina_id, **dados.model_dump())
    db.add(formula)
    db.commit()
    db.refresh(formula)
    return formula


# Atualiza as operações de uma fórmula existente.
@router.patch("/{formula_id}", response_model=WiseFormulaResponse)
def atualizar_formula(linha_id: int, maquina_id: int, formula_id: int, dados: WiseFormulaUpdate, db: Session = Depends(get_db)):
    formula = db.query(WiseFormula).filter(
        WiseFormula.id == formula_id,
        WiseFormula.maquina_linha_id == maquina_id,
    ).first()
    if not formula:
        raise HTTPException(status_code=404, detail="Fórmula não encontrada")
    if dados.operacoes is not None:
        formula.operacoes = dados.operacoes
    db.commit()
    db.refresh(formula)
    return formula


# Remove uma fórmula.
@router.delete("/{formula_id}")
def deletar_formula(linha_id: int, maquina_id: int, formula_id: int, db: Session = Depends(get_db)):
    formula = db.query(WiseFormula).filter(
        WiseFormula.id == formula_id,
        WiseFormula.maquina_linha_id == maquina_id,
    ).first()
    if not formula:
        raise HTTPException(status_code=404, detail="Fórmula não encontrada")
    db.delete(formula)
    db.commit()
    return {"ok": True}