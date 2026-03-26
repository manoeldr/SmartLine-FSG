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
def medicao_payload():
    return {
        "cliente": "Sanmartin",
        "maquina": "Enchedora",
        "turno_inicio": "08:00",
        "turno_fim": "17:00",
        "velocidade_nominal": 12000.0,
        "producao_inicial": 24500
    }

def test_criar_medicao(client, medicao_payload):
    r = client.post("/medicoes/", json=medicao_payload)
    assert r.status_code == 200
    assert r.json()["cliente"] == "Sanmartin"
    assert r.json()["id"] is not None

def test_listar_medicoes(client, medicao_payload):
    client.post("/medicoes/", json=medicao_payload)
    client.post("/medicoes/", json=medicao_payload)
    r = client.get("/medicoes/")
    assert r.status_code == 200
    assert len(r.json()) >= 2

def test_buscar_medicao(client, medicao_payload):
    criada = client.post("/medicoes/", json=medicao_payload).json()
    r = client.get(f"/medicoes/{criada['id']}")
    assert r.status_code == 200
    assert r.json()["id"] == criada["id"]

def test_buscar_medicao_inexistente(client):
    r = client.get("/medicoes/999999")
    assert r.status_code == 404

def test_finalizar_medicao(client, medicao_payload):
    criada = client.post("/medicoes/", json=medicao_payload).json()
    r = client.patch(f"/medicoes/{criada['id']}/finalizar", json={"producao_final": 36800})
    assert r.status_code == 200
    assert r.json()["producao_final"] == 36800
    assert r.json()["timestamp_fim"] is not None

def test_finalizar_medicao_ja_finalizada(client, medicao_payload):
    criada = client.post("/medicoes/", json=medicao_payload).json()
    client.patch(f"/medicoes/{criada['id']}/finalizar", json={"producao_final": 36800})
    r = client.patch(f"/medicoes/{criada['id']}/finalizar", json={"producao_final": 36800})
    assert r.status_code == 400