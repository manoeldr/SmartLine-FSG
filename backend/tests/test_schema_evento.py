import pytest
from datetime import datetime
from backend.schemas.evento import EventoCreate, EventoResponse

def test_evento_create_marcha():
    e = EventoCreate(tipo="marcha")
    assert e.tipo == "marcha"
    assert e.motivo is None
    assert e.producao_leitura is None

def test_evento_create_parada_com_motivo():
    e = EventoCreate(
        tipo="parada",
        motivo="Falta de embalagem",
        producao_leitura=28000
    )
    assert e.tipo == "parada"
    assert e.motivo == "Falta de embalagem"
    assert e.producao_leitura == 28000

def test_evento_create_sem_tipo_falha():
    with pytest.raises(Exception):
        EventoCreate()

def test_evento_response_from_orm():
    class FakeEvento:
        id = 1
        medicao_id = 10
        tipo = "parada"
        timestamp = datetime.now()
        motivo = "Ajuste mecânico"
        producao_leitura = 30000

    r = EventoResponse.model_validate(FakeEvento())
    assert r.id == 1
    assert r.tipo == "parada"
    assert r.motivo == "Ajuste mecânico"