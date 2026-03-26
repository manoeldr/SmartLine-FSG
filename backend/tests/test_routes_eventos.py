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
def medicao_criada(client):
    payload = {
        "cliente": "Sanmartin",
        "maquina": "Enchedora",
        "turno_inicio": "08:00",
        "turno_fim": "17:00",
        "velocidade_nominal": 12000.0,
        "producao_inicial": 24500
    }
    return client.post("/medicoes/", json=payload).json()

def test_registrar_marcha(client, medicao_criada):
    mid = medicao_criada["id"]
    r = client.post(f"/medicoes/{mid}/eventos/", json={"tipo": "marcha"})
    assert r.status_code == 200
    assert r.json()["tipo"] == "marcha"
    assert r.json()["medicao_id"] == mid

def test_registrar_parada_com_motivo(client, medicao_criada):
    mid = medicao_criada["id"]
    r = client.post(f"/medicoes/{mid}/eventos/", json={
        "tipo": "parada",
        "motivo": "Falta de embalagem",
        "producao_leitura": 28000
    })
    assert r.status_code == 200
    assert r.json()["tipo"] == "parada"
    assert r.json()["motivo"] == "Falta de embalagem"
    assert r.json()["producao_leitura"] == 28000

def test_registrar_evento_tipo_invalido(client, medicao_criada):
    mid = medicao_criada["id"]
    r = client.post(f"/medicoes/{mid}/eventos/", json={"tipo": "invalido"})
    assert r.status_code == 422

def test_registrar_evento_medicao_inexistente(client):
    r = client.post("/medicoes/999999/eventos/", json={"tipo": "marcha"})
    assert r.status_code == 404

def test_registrar_evento_medicao_finalizada(client, medicao_criada):
    mid = medicao_criada["id"]
    client.patch(f"/medicoes/{mid}/finalizar", json={"producao_final": 36800})
    r = client.post(f"/medicoes/{mid}/eventos/", json={"tipo": "marcha"})
    assert r.status_code == 400

def test_listar_eventos(client, medicao_criada):
    mid = medicao_criada["id"]
    client.post(f"/medicoes/{mid}/eventos/", json={"tipo": "marcha"})
    client.post(f"/medicoes/{mid}/eventos/", json={"tipo": "parada", "motivo": "Ajuste"})
    r = client.get(f"/medicoes/{mid}/eventos/")
    assert r.status_code == 200
    assert len(r.json()) >= 2

def test_listar_eventos_medicao_inexistente(client):
    r = client.get("/medicoes/999999/eventos/")
    assert r.status_code == 404