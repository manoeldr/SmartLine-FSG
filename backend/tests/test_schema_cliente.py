import pytest
from backend.schemas.cliente import ClienteCreate, ClienteResponse

def test_cliente_create_valido():
    c = ClienteCreate(nome="Sanmartin")
    assert c.nome == "Sanmartin"

def test_cliente_create_sem_nome_falha():
    with pytest.raises(Exception):
        ClienteCreate()

def test_cliente_response_from_orm():
    class FakeCliente:
        id = 1
        nome = "Sanmartin"

    r = ClienteResponse.model_validate(FakeCliente())
    assert r.id == 1
    assert r.nome == "Sanmartin"