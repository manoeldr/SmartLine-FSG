import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.database import Base
from backend.models.cliente import Cliente
from backend.models.linha import Linha
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
def cliente(db):
    c = Cliente(nome="Sanmartin")
    db.add(c)
    db.commit()
    db.refresh(c)
    return c

def test_criar_linha(db, cliente):
    l = Linha(nome="Linha 1", cliente_id=cliente.id)
    db.add(l)
    db.commit()
    db.refresh(l)
    assert l.id is not None
    assert l.nome == "Linha 1"
    assert l.cliente_id == cliente.id

def test_relacionamento_cliente_linhas(db, cliente):
    db.add(Linha(nome="Linha 1", cliente_id=cliente.id))
    db.add(Linha(nome="Linha 2", cliente_id=cliente.id))
    db.commit()
    db.refresh(cliente)
    assert len(cliente.linhas) == 2

def test_linha_sem_cliente_falha(db):
    with pytest.raises(Exception):
        db.add(Linha(nome="Linha 1"))
        db.commit()