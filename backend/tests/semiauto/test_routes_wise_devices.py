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
def maquina_criada(client):
    cliente = client.post("/clientes/", json={"nome": "Sanmartin"}).json()
    linha = client.post("/linhas/", json={"nome": "Linha 1", "cliente_id": cliente["id"]}).json()
    maquina = client.post(
        f"/linhas/{linha['id']}/maquinas/",
        json={"nome": "Enchedora", "ordem": 1, "linha_id": linha["id"]}
    ).json()
    return {"linha_id": linha["id"], "maquina_id": maquina["id"]}


def base_url(maquina_criada):
    return f"/linhas/{maquina_criada['linha_id']}/maquinas/{maquina_criada['maquina_id']}/wise/devices"


def test_criar_device(client, maquina_criada):
    r = client.post(base_url(maquina_criada) + "/", json={"ip": "192.168.1.100", "posicao": "saida"})
    assert r.status_code == 200
    assert r.json()["ip"] == "192.168.1.100"
    assert r.json()["posicao"] == "saida"
    assert r.json()["id"] is not None


def test_criar_device_ip_duplicado(client, maquina_criada):
    client.post(base_url(maquina_criada) + "/", json={"ip": "192.168.1.100", "posicao": "saida"})
    r = client.post(base_url(maquina_criada) + "/", json={"ip": "192.168.1.100", "posicao": "entrada"})
    assert r.status_code == 400


def test_listar_devices(client, maquina_criada):
    client.post(base_url(maquina_criada) + "/", json={"ip": "192.168.1.100", "posicao": "saida", "ordem": 1})
    client.post(base_url(maquina_criada) + "/", json={"ip": "192.168.1.101", "posicao": "inspetor", "ordem": 2})
    r = client.get(base_url(maquina_criada) + "/")
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_atualizar_device(client, maquina_criada):
    criado = client.post(base_url(maquina_criada) + "/", json={"ip": "192.168.1.100", "posicao": "saida"}).json()
    r = client.patch(base_url(maquina_criada) + f"/{criado['id']}", json={"posicao": "entrada"})
    assert r.status_code == 200
    assert r.json()["posicao"] == "entrada"


def test_deletar_device(client, maquina_criada):
    criado = client.post(base_url(maquina_criada) + "/", json={"ip": "192.168.1.100", "posicao": "saida"}).json()
    r = client.delete(base_url(maquina_criada) + f"/{criado['id']}")
    assert r.status_code == 200
    r2 = client.get(base_url(maquina_criada) + "/")
    assert len(r2.json()) == 0


def test_device_maquina_inexistente(client, maquina_criada):
    url = f"/linhas/{maquina_criada['linha_id']}/maquinas/999999/wise/devices/"
    r = client.post(url, json={"ip": "192.168.1.100", "posicao": "saida"})
    assert r.status_code == 404