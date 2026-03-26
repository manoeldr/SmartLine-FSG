import pytest
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.database import Base
from backend.models.medicao import Medicao
from backend.models.evento import Evento

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
def medicao(db):
    m = Medicao(
        cliente="Sanmartin",
        maquina="Enchedora",
        turno_inicio="08:00",
        turno_fim="17:00",
        velocidade_nominal=12000.0,
        producao_inicial=24500
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m

def test_cria_evento_marcha(db, medicao):
    e = Evento(medicao_id=medicao.id, tipo="marcha")
    db.add(e)
    db.commit()
    db.refresh(e)

    assert e.id is not None
    assert e.tipo == "marcha"
    assert e.motivo is None
    assert e.producao_leitura is None

def test_cria_evento_parada_com_motivo(db, medicao):
    e = Evento(
        medicao_id=medicao.id,
        tipo="parada",
        motivo="Falta de embalagem",
        producao_leitura=28000
    )
    db.add(e)
    db.commit()
    db.refresh(e)

    assert e.tipo == "parada"
    assert e.motivo == "Falta de embalagem"
    assert e.producao_leitura == 28000

def test_relacionamento_medicao_eventos(db, medicao):
    db.add(Evento(medicao_id=medicao.id, tipo="marcha"))
    db.add(Evento(medicao_id=medicao.id, tipo="parada", motivo="Ajuste"))
    db.add(Evento(medicao_id=medicao.id, tipo="marcha"))
    db.commit()
    db.refresh(medicao)

    assert len(medicao.eventos) == 3
    assert medicao.eventos[1].motivo == "Ajuste"

def test_evento_sem_medicao_falha(db):
    with pytest.raises(Exception):
        e = Evento(tipo="marcha")
        db.add(e)
        db.commit()