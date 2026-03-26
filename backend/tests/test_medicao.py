import pytest
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.database import Base
from backend.models.medicao import Medicao

# Banco em memória isolado para os testes
@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(engine)

def test_cria_medicao(db):
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

    assert m.id is not None
    assert m.cliente == "Sanmartin"
    assert m.producao_final is None
    assert m.timestamp_fim is None

def test_finaliza_medicao(db):
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

    m.producao_final = 36800
    m.timestamp_fim = datetime.now()
    db.commit()
    db.refresh(m)

    assert m.producao_final == 36800
    assert m.timestamp_fim is not None

def test_medicao_sem_cliente_falha(db):
    with pytest.raises(Exception):
        m = Medicao(
            maquina="Enchedora",
            turno_inicio="08:00",
            turno_fim="17:00",
            velocidade_nominal=12000.0,
            producao_inicial=24500
        )
        db.add(m)
        db.commit()