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

@pytest.fixture
def cliente_criado(client):
    return client.post("/clientes/", json={"nome": "Sanmartin Linhas"}).json()

def test_criar_linha(client, cliente_criado):
    r = client.post("/linhas/", json={"nome": "Linha 1", "cliente_id": cliente_criado["id"]})
    assert r.status_code == 200
    assert r.json()["nome"] == "Linha 1"
    assert r.json()["cliente_id"] == cliente_criado["id"]

def test_criar_linha_cliente_inexistente(client):
    r = client.post("/linhas/", json={"nome": "Linha X", "cliente_id": 999999})
    assert r.status_code == 404

def test_listar_linhas(client, cliente_criado):
    client.post("/linhas/", json={"nome": "Linha A", "cliente_id": cliente_criado["id"]})
    client.post("/linhas/", json={"nome": "Linha B", "cliente_id": cliente_criado["id"]})
    r = client.get("/linhas/")
    assert r.status_code == 200
    assert len(r.json()) >= 2

def test_buscar_linha(client, cliente_criado):
    criada = client.post("/linhas/", json={"nome": "Linha C", "cliente_id": cliente_criado["id"]}).json()
    r = client.get(f"/linhas/{criada['id']}")
    assert r.status_code == 200
    assert r.json()["id"] == criada["id"]

def test_buscar_linha_inexistente(client):
    r = client.get("/linhas/999999")
    assert r.status_code == 404

def test_listar_linhas_por_cliente(client, cliente_criado):
    client.post("/linhas/", json={"nome": "Linha D", "cliente_id": cliente_criado["id"]})
    client.post("/linhas/", json={"nome": "Linha E", "cliente_id": cliente_criado["id"]})
    r = client.get(f"/linhas/cliente/{cliente_criado['id']}")
    assert r.status_code == 200
    assert len(r.json()) >= 2