import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.database import Base
from backend.models.cliente import Cliente
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

def test_criar_cliente(db):
    c = Cliente(nome="Sanmartin")
    db.add(c)
    db.commit()
    db.refresh(c)
    assert c.id is not None
    assert c.nome == "Sanmartin"

def test_nome_unico(db):
    db.add(Cliente(nome="Sanmartin"))
    db.commit()
    with pytest.raises(Exception):
        db.add(Cliente(nome="Sanmartin"))
        db.commit()

def test_cliente_sem_nome_falha(db):
    with pytest.raises(Exception):
        db.add(Cliente())
        db.commit()