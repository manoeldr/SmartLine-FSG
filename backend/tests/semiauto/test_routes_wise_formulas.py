import pytest
import json
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


def base_url(m):
    return f"/linhas/{m['linha_id']}/maquinas/{m['maquina_id']}/wise/formulas"


def test_criar_formula_producao(client, maquina_criada):
    operacoes = json.dumps([
        {"posicao": "saida", "operacao": "+"},
        {"posicao": "inspetor", "operacao": "-"},
    ])
    r = client.post(base_url(maquina_criada) + "/", json={"resultado": "producao", "operacoes": operacoes})
    assert r.status_code == 200
    assert r.json()["resultado"] == "producao"
    parsed = json.loads(r.json()["operacoes"])
    assert parsed[0]["posicao"] == "saida"


def test_criar_formula_refugo(client, maquina_criada):
    operacoes = json.dumps([{"posicao": "inspetor", "operacao": "+"}])
    r = client.post(base_url(maquina_criada) + "/", json={"resultado": "refugo", "operacoes": operacoes})
    assert r.status_code == 200
    assert r.json()["resultado"] == "refugo"


def test_resultado_invalido(client, maquina_criada):
    r = client.post(base_url(maquina_criada) + "/", json={"resultado": "invalido", "operacoes": "[]"})
    assert r.status_code == 422


def test_formula_substitui_existente(client, maquina_criada):
    op1 = json.dumps([{"posicao": "saida", "operacao": "+"}])
    op2 = json.dumps([{"posicao": "entrada", "operacao": "+"}])
    client.post(base_url(maquina_criada) + "/", json={"resultado": "producao", "operacoes": op1})
    r = client.post(base_url(maquina_criada) + "/", json={"resultado": "producao", "operacoes": op2})
    assert r.status_code == 200
    parsed = json.loads(r.json()["operacoes"])
    assert parsed[0]["posicao"] == "entrada"
    # Deve haver apenas uma fórmula de produção
    lista = client.get(base_url(maquina_criada) + "/").json()
    producao = [f for f in lista if f["resultado"] == "producao"]
    assert len(producao) == 1


def test_listar_formulas(client, maquina_criada):
    op = json.dumps([{"posicao": "saida", "operacao": "+"}])
    client.post(base_url(maquina_criada) + "/", json={"resultado": "producao", "operacoes": op})
    client.post(base_url(maquina_criada) + "/", json={"resultado": "refugo", "operacoes": op})
    r = client.get(base_url(maquina_criada) + "/")
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_atualizar_formula(client, maquina_criada):
    op1 = json.dumps([{"posicao": "saida", "operacao": "+"}])
    criada = client.post(base_url(maquina_criada) + "/", json={"resultado": "producao", "operacoes": op1}).json()
    op2 = json.dumps([{"posicao": "entrada", "operacao": "+"}])
    r = client.patch(base_url(maquina_criada) + f"/{criada['id']}", json={"operacoes": op2})
    assert r.status_code == 200
    parsed = json.loads(r.json()["operacoes"])
    assert parsed[0]["posicao"] == "entrada"


def test_deletar_formula(client, maquina_criada):
    op = json.dumps([{"posicao": "saida", "operacao": "+"}])
    criada = client.post(base_url(maquina_criada) + "/", json={"resultado": "producao", "operacoes": op}).json()
    r = client.delete(base_url(maquina_criada) + f"/{criada['id']}")
    assert r.status_code == 200
    r2 = client.get(base_url(maquina_criada) + "/")
    assert len(r2.json()) == 0


def test_formula_maquina_inexistente(client, maquina_criada):
    url = f"/linhas/{maquina_criada['linha_id']}/maquinas/999999/wise/formulas/"
    r = client.post(url, json={"resultado": "producao", "operacoes": "[]"})
    assert r.status_code == 404