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
def linha_criada(client):
    cliente = client.post("/clientes/", json={"nome": "Sanmartin"}).json()
    return client.post("/linhas/", json={"nome": "Linha 1", "cliente_id": cliente["id"]}).json()

def test_criar_maquina(client, linha_criada):
    r = client.post(f"/linhas/{linha_criada['id']}/maquinas/", json={"nome": "Enchedora", "ordem": 1, "linha_id": linha_criada["id"]})
    assert r.status_code == 200
    assert r.json()["nome"] == "Enchedora"
    assert r.json()["ordem"] == 1

def test_listar_maquinas_em_ordem(client, linha_criada):
    lid = linha_criada["id"]
    client.post(f"/linhas/{lid}/maquinas/", json={"nome": "Rotuladora", "ordem": 3, "linha_id": lid})
    client.post(f"/linhas/{lid}/maquinas/", json={"nome": "Lavadora", "ordem": 1, "linha_id": lid})
    client.post(f"/linhas/{lid}/maquinas/", json={"nome": "Enchedora", "ordem": 2, "linha_id": lid})
    r = client.get(f"/linhas/{lid}/maquinas/")
    assert r.status_code == 200
    nomes = [m["nome"] for m in r.json()]
    assert nomes == ["Lavadora", "Enchedora", "Rotuladora"]

def test_atualizar_maquina(client, linha_criada):
    lid = linha_criada["id"]
    criada = client.post(f"/linhas/{lid}/maquinas/", json={"nome": "Enchedora", "ordem": 1, "linha_id": lid}).json()
    r = client.patch(f"/linhas/{lid}/maquinas/{criada['id']}", json={"nome": "Enchedora V2"})
    assert r.status_code == 200
    assert r.json()["nome"] == "Enchedora V2"

def test_deletar_maquina(client, linha_criada):
    lid = linha_criada["id"]
    criada = client.post(f"/linhas/{lid}/maquinas/", json={"nome": "Enchedora", "ordem": 1, "linha_id": lid}).json()
    r = client.delete(f"/linhas/{lid}/maquinas/{criada['id']}")
    assert r.status_code == 200
    r2 = client.get(f"/linhas/{lid}/maquinas/")
    assert len(r2.json()) == 0

def test_maquina_linha_inexistente(client, linha_criada):
    r = client.get(f"/linhas/999999/maquinas/")
    assert r.status_code == 404