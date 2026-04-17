import pytest
from backend.schemas.semiauto.wise_channel import WiseChannelCreate, WiseChannelUpdate, WiseChannelResponse


def test_channel_create_di_marcha_parada():
    ch = WiseChannelCreate(numero_canal=0, tipo="DI", funcao="marcha_parada")
    assert ch.numero_canal == 0
    assert ch.tipo == "DI"
    assert ch.funcao == "marcha_parada"
    assert ch.alarme_motivo is None
    assert ch.ativo is True


def test_channel_create_counter_contagem():
    ch = WiseChannelCreate(numero_canal=1, tipo="Counter", funcao="contagem")
    assert ch.tipo == "Counter"
    assert ch.funcao == "contagem"


def test_channel_create_alarme_com_motivo():
    ch = WiseChannelCreate(numero_canal=2, tipo="DI", funcao="alarme", alarme_motivo="Falta de embalagem")
    assert ch.funcao == "alarme"
    assert ch.alarme_motivo == "Falta de embalagem"


def test_channel_create_sem_campos_obrigatorios_falha():
    with pytest.raises(Exception):
        WiseChannelCreate()


def test_channel_update_todos_opcionais():
    ch = WiseChannelUpdate()
    assert ch.tipo is None
    assert ch.funcao is None
    assert ch.alarme_motivo is None
    assert ch.ativo is None


def test_channel_update_parcial():
    ch = WiseChannelUpdate(ativo=False)
    assert ch.ativo is False
    assert ch.tipo is None


def test_channel_response_from_orm():
    class FakeChannel:
        id = 1
        device_id = 5
        numero_canal = 0
        tipo = "DI"
        funcao = "marcha_parada"
        alarme_motivo = None
        ativo = True

    r = WiseChannelResponse.model_validate(FakeChannel())
    assert r.id == 1
    assert r.tipo == "DI"
    assert r.funcao == "marcha_parada"
    assert r.alarme_motivo is None