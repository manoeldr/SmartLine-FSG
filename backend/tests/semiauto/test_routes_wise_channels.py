import pytest
from fastapi.testclient import TestClient
from backend.database import get_db
from backend.main import app
from backend.tests.semiauto.conftest import TestSession


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
def device_criado(client):
    cliente = client.post("/clientes/", json={"nome": "Sanmartin"}).json()
    linha = client.post("/linhas/", json={"nome": "Linha 1", "cliente_id": cliente["id"]}).json()
    maquina = client.post(
        f"/linhas/{linha['id']}/maquinas/",
        json={"nome": "Enchedora", "ordem": 1, "linha_id": linha["id"]}
    ).json()
    device = client.post(
        f"/linhas/{linha['id']}/maquinas/{maquina['id']}/wise/devices/",
        json={"ip": "192.168.1.100", "posicao": "saida"}
    ).json()
    return {
        "linha_id": linha["id"],
        "maquina_id": maquina["id"],
        "device_id": device["id"],
    }


def base_url(d):
    return f"/linhas/{d['linha_id']}/maquinas/{d['maquina_id']}/wise/devices/{d['device_id']}/channels"


def test_criar_channel_di(client, device_criado):
    url = base_url(device_criado) + "/"
    print(f"\nURL: {url}")
    r = client.post(url, json={"numero_canal": 0, "tipo": "DI", "funcao": "marcha_parada"})
    print(f"Response: {r.status_code} {r.text}")
    assert r.status_code == 200
    assert r.json()["tipo"] == "DI"
    assert r.json()["funcao"] == "marcha_parada"


def test_criar_channel_counter(client, device_criado):
    r = client.post(base_url(device_criado) + "/", json={"numero_canal": 1, "tipo": "Counter", "funcao": "contagem"})
    assert r.status_code == 200
    assert r.json()["tipo"] == "Counter"


def test_criar_channel_alarme(client, device_criado):
    r = client.post(base_url(device_criado) + "/", json={
        "numero_canal": 2, "tipo": "DI", "funcao": "alarme", "alarme_motivo": "Falta de embalagem"
    })
    assert r.status_code == 200
    assert r.json()["alarme_motivo"] == "Falta de embalagem"


def test_criar_channel_tipo_invalido(client, device_criado):
    r = client.post(base_url(device_criado) + "/", json={"numero_canal": 0, "tipo": "INVALIDO", "funcao": "contagem"})
    assert r.status_code == 422


def test_criar_channel_funcao_invalida(client, device_criado):
    r = client.post(base_url(device_criado) + "/", json={"numero_canal": 0, "tipo": "DI", "funcao": "invalida"})
    assert r.status_code == 422


def test_criar_channel_alarme_sem_motivo(client, device_criado):
    r = client.post(base_url(device_criado) + "/", json={"numero_canal": 0, "tipo": "DI", "funcao": "alarme"})
    assert r.status_code == 422


def test_criar_channel_canal_duplicado(client, device_criado):
    client.post(base_url(device_criado) + "/", json={"numero_canal": 0, "tipo": "DI", "funcao": "marcha_parada"})
    r = client.post(base_url(device_criado) + "/", json={"numero_canal": 0, "tipo": "DI", "funcao": "alarme", "alarme_motivo": "X"})
    assert r.status_code == 400


def test_listar_channels(client, device_criado):
    client.post(base_url(device_criado) + "/", json={"numero_canal": 0, "tipo": "DI", "funcao": "marcha_parada"})
    client.post(base_url(device_criado) + "/", json={"numero_canal": 1, "tipo": "Counter", "funcao": "contagem"})
    r = client.get(base_url(device_criado) + "/")
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_atualizar_channel(client, device_criado):
    criado = client.post(base_url(device_criado) + "/", json={"numero_canal": 0, "tipo": "DI", "funcao": "marcha_parada"}).json()
    r = client.patch(base_url(device_criado) + f"/{criado['id']}", json={"ativo": False})
    assert r.status_code == 200
    assert r.json()["ativo"] is False


def test_deletar_channel(client, device_criado):
    criado = client.post(base_url(device_criado) + "/", json={"numero_canal": 0, "tipo": "DI", "funcao": "marcha_parada"}).json()
    r = client.delete(base_url(device_criado) + f"/{criado['id']}")
    assert r.status_code == 200
    r2 = client.get(base_url(device_criado) + "/")
    assert len(r2.json()) == 0