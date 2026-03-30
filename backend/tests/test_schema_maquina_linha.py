import pytest
from backend.schemas.maquina_linha import MaquinaLinhaCreate, MaquinaLinhaUpdate, MaquinaLinhaResponse

def test_maquina_linha_create_valido():
    m = MaquinaLinhaCreate(nome="Enchedora", ordem=2, linha_id=1)
    assert m.nome == "Enchedora"
    assert m.ordem == 2
    assert m.linha_id == 1

def test_maquina_linha_create_sem_campos_falha():
    with pytest.raises(Exception):
        MaquinaLinhaCreate()

def test_maquina_linha_update_campos_opcionais():
    m = MaquinaLinhaUpdate()
    assert m.nome is None
    assert m.ordem is None

def test_maquina_linha_update_parcial():
    m = MaquinaLinhaUpdate(nome="Rotuladora")
    assert m.nome == "Rotuladora"
    assert m.ordem is None

def test_maquina_linha_response_from_orm():
    class FakeMaquina:
        id = 1
        nome = "Enchedora"
        ordem = 2
        linha_id = 1

    r = MaquinaLinhaResponse.model_validate(FakeMaquina())
    assert r.id == 1
    assert r.nome == "Enchedora"
    assert r.ordem == 2