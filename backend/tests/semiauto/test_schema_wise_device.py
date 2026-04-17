import pytest
from backend.schemas.semiauto.wise_device import WiseDeviceCreate, WiseDeviceUpdate, WiseDeviceResponse


def test_device_create_valido():
    d = WiseDeviceCreate(ip="192.168.1.100", posicao="saida")
    assert d.ip == "192.168.1.100"
    assert d.posicao == "saida"
    assert d.ordem == 1
    assert d.ativo is True


def test_device_create_sem_campos_obrigatorios_falha():
    with pytest.raises(Exception):
        WiseDeviceCreate()


def test_device_create_sem_ip_falha():
    with pytest.raises(Exception):
        WiseDeviceCreate(posicao="saida")


def test_device_create_sem_posicao_falha():
    with pytest.raises(Exception):
        WiseDeviceCreate(ip="192.168.1.100")


def test_device_update_todos_opcionais():
    d = WiseDeviceUpdate()
    assert d.ip is None
    assert d.posicao is None
    assert d.ordem is None
    assert d.ativo is None


def test_device_update_parcial():
    d = WiseDeviceUpdate(ip="192.168.1.200")
    assert d.ip == "192.168.1.200"
    assert d.posicao is None


def test_device_response_from_orm():
    class FakeDevice:
        id = 1
        maquina_linha_id = 10
        ip = "192.168.1.100"
        posicao = "saida"
        ordem = 1
        ativo = True

    r = WiseDeviceResponse.model_validate(FakeDevice())
    assert r.id == 1
    assert r.ip == "192.168.1.100"
    assert r.posicao == "saida"
    assert r.ativo is True
    