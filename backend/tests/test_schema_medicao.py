import pytest
from datetime import datetime
from backend.schemas.medicao import MedicaoCreate, MedicaoUpdate, MedicaoResponse

def test_medicao_create_valido():
    m = MedicaoCreate(
        cliente="Sanmartin",
        maquina="Enchedora",
        turno_inicio="08:00",
        turno_fim="17:00",
        velocidade_nominal=12000.0,
        producao_inicial=24500
    )
    assert m.cliente == "Sanmartin"
    assert m.producao_inicial == 24500

def test_medicao_create_faltando_campo():
    with pytest.raises(Exception):
        MedicaoCreate(
            cliente="Sanmartin",
            maquina="Enchedora",
            turno_inicio="08:00",
            turno_fim="17:00",
            velocidade_nominal=12000.0
            # producao_inicial faltando
        )

def test_medicao_update_campos_opcionais():
    m = MedicaoUpdate()
    assert m.producao_final is None
    assert m.timestamp_fim is None

def test_medicao_update_com_valores():
    m = MedicaoUpdate(producao_final=36800, timestamp_fim=datetime.now())
    assert m.producao_final == 36800
    assert m.timestamp_fim is not None

def test_medicao_response_from_orm():
    class FakeMedicao:
        id = 1
        cliente = "Sanmartin"
        maquina = "Enchedora"
        turno_inicio = "08:00"
        turno_fim = "17:00"
        velocidade_nominal = 12000.0
        producao_inicial = 24500
        producao_final = None
        timestamp_inicio = datetime.now()
        timestamp_fim = None

    r = MedicaoResponse.model_validate(FakeMedicao())
    assert r.id == 1
    assert r.cliente == "Sanmartin"
    assert r.producao_final is None