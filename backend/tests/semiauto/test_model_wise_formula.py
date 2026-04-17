import pytest
import json
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.database import Base
from backend.models.cliente import Cliente
from backend.models.linha import Linha
from backend.models.maquina_linha import MaquinaLinha
from backend.models.semiauto.wise_formula import WiseFormula
import backend.models.semiauto.wise_device
import backend.models.semiauto.wise_channel
import backend.models.semiauto.wise_raw


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(engine)


@pytest.fixture
def maquina(db):
    c = Cliente(nome="Sanmartin")
    db.add(c)
    db.commit()
    l = Linha(nome="Linha 1", cliente_id=c.id)
    db.add(l)
    db.commit()
    m = MaquinaLinha(nome="Enchedora", ordem=1, linha_id=l.id)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


def test_criar_formula_producao(db, maquina):
    operacoes = json.dumps([
        {"posicao": "saida", "operacao": "+"},
        {"posicao": "inspetor", "operacao": "-"},
    ])
    f = WiseFormula(
        maquina_linha_id=maquina.id,
        resultado="producao",
        operacoes=operacoes,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    assert f.id is not None
    assert f.resultado == "producao"
    parsed = json.loads(f.operacoes)
    assert parsed[0]["posicao"] == "saida"
    assert parsed[1]["operacao"] == "-"


def test_criar_formula_refugo(db, maquina):
    operacoes = json.dumps([
        {"posicao": "inspetor", "operacao": "+"},
    ])
    f = WiseFormula(maquina_linha_id=maquina.id, resultado="refugo", operacoes=operacoes)
    db.add(f)
    db.commit()
    db.refresh(f)
    assert f.resultado == "refugo"


def test_multiplas_formulas_por_maquina(db, maquina):
    db.add(WiseFormula(
        maquina_linha_id=maquina.id,
        resultado="producao",
        operacoes=json.dumps([{"posicao": "saida", "operacao": "+"}]),
    ))
    db.add(WiseFormula(
        maquina_linha_id=maquina.id,
        resultado="refugo",
        operacoes=json.dumps([{"posicao": "inspetor", "operacao": "+"}]),
    ))
    db.commit()
    db.refresh(maquina)
    assert len(maquina.wise_formulas) == 2


def test_cascade_delete_formulas(db, maquina):
    db.add(WiseFormula(
        maquina_linha_id=maquina.id,
        resultado="producao",
        operacoes=json.dumps([{"posicao": "saida", "operacao": "+"}]),
    ))
    db.commit()
    db.delete(maquina)
    db.commit()
    formulas = db.query(WiseFormula).all()
    assert len(formulas) == 0


def test_formula_sem_maquina_falha(db):
    with pytest.raises(Exception):
        db.add(WiseFormula(resultado="producao", operacoes="[]"))
        db.commit()