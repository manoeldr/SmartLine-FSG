import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.database import Base
from backend.models.cliente import Cliente
from backend.models.linha import Linha
from backend.models.maquina_linha import MaquinaLinha
import backend.models

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
def linha(db):
    c = Cliente(nome="Sanmartin")
    db.add(c)
    db.commit()
    l = Linha(nome="Linha 1", cliente_id=c.id)
    db.add(l)
    db.commit()
    db.refresh(l)
    return l

def test_criar_maquina_linha(db, linha):
    m = MaquinaLinha(nome="Enchedora", ordem=1, linha_id=linha.id)
    db.add(m)
    db.commit()
    db.refresh(m)
    assert m.id is not None
    assert m.nome == "Enchedora"
    assert m.ordem == 1

def test_ordem_maquinas_na_linha(db, linha):
    db.add(MaquinaLinha(nome="Lavadora", ordem=1, linha_id=linha.id))
    db.add(MaquinaLinha(nome="Enchedora", ordem=2, linha_id=linha.id))
    db.add(MaquinaLinha(nome="Rotuladora", ordem=3, linha_id=linha.id))
    db.commit()
    db.refresh(linha)
    nomes = [m.nome for m in linha.maquinas]
    assert nomes == ["Lavadora", "Enchedora", "Rotuladora"]

def test_maquina_sem_linha_falha(db):
    with pytest.raises(Exception):
        db.add(MaquinaLinha(nome="Enchedora", ordem=1))
        db.commit()