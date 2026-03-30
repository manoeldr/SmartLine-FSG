import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.database import Base
import backend.models.medicao
import backend.models.evento
import backend.models.cliente
import backend.models.linha
import backend.models.maquina_linha

TEST_DB_URL = "sqlite:///./test_smartline.db"

engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestSession = sessionmaker(bind=engine)

@pytest.fixture(scope="session", autouse=True)
def setup_database():
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)

@pytest.fixture(autouse=True)
def limpar_tabelas():
    yield
    db = TestSession()
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(table.delete())
    db.commit()
    db.close()

@pytest.fixture
def db_session():
    session = TestSession()
    yield session
    session.close()