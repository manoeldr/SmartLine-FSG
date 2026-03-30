import pytest
from fastapi.testclient import TestClient
from backend.database import get_db
from backend.main import app
from backend.tests.conftest import TestSession

@pytest.fixture
def client():
    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()

def test_criar_cliente(client):
    r = client.post("/clientes/", json={"nome": "Sanmartin"})
    assert r.status_code == 200
    assert r.json()["nome"] == "Sanmartin"
    assert r.json()["id"] is not None

def test_criar_cliente_duplicado(client):
    client.post("/clientes/", json={"nome": "Aurora"})
    r = client.post("/clientes/", json={"nome": "Aurora"})
    assert r.status_code == 400

def test_listar_clientes(client):
    client.post("/clientes/", json={"nome": "ClienteA"})
    client.post("/clientes/", json={"nome": "ClienteB"})
    r = client.get("/clientes/")
    assert r.status_code == 200
    assert len(r.json()) >= 2

def test_buscar_cliente(client):
    criado = client.post("/clientes/", json={"nome": "ClienteC"}).json()
    r = client.get(f"/clientes/{criado['id']}")
    assert r.status_code == 200
    assert r.json()["id"] == criado["id"]

def test_buscar_cliente_inexistente(client):
    r = client.get("/clientes/999999")
    assert r.status_code == 404