import pytest
from backend.schemas.linha import LinhaCreate, LinhaResponse

def test_linha_create_valido():
    l = LinhaCreate(nome="Linha 1", cliente_id=1)
    assert l.nome == "Linha 1"
    assert l.cliente_id == 1

def test_linha_create_sem_campos_falha():
    with pytest.raises(Exception):
        LinhaCreate()

def test_linha_response_from_orm():
    class FakeLinha:
        id = 1
        nome = "Linha 1"
        cliente_id = 1

    r = LinhaResponse.model_validate(FakeLinha())
    assert r.id == 1
    assert r.nome == "Linha 1"
    assert r.cliente_id == 1