import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.database import Base
from backend.models.cliente import Cliente
from backend.models.linha import Linha
from backend.models.maquina_linha import MaquinaLinha
from backend.models.semiauto.wise_device import WiseDevice
import backend.models.semiauto.wise_channel
import backend.models.semiauto.wise_formula
import backend.models.semiauto.wise_raw


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(engine)


@pytest.fixture
def maquina(db):
    c = Cliente(nome="Sanmartin")
    db.add(c)
    db.commit()
    l = Linha(nome="Linha 1", cliente_id=c.id)
    db.add(l)
    db.commit()
    m = MaquinaLinha(nome="Enchedora", ordem=1, linha_id=l.id)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


def test_criar_wise_device(db, maquina):
    d = WiseDevice(
        maquina_linha_id=maquina.id,
        ip="192.168.1.100",
        posicao="saida",
        ordem=1,
        ativo=True,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    assert d.id is not None
    assert d.ip == "192.168.1.100"
    assert d.posicao == "saida"
    assert d.ativo is True


def test_wise_device_padrao_ativo(db, maquina):
    d = WiseDevice(maquina_linha_id=maquina.id, ip="192.168.1.101", posicao="entrada", ordem=2)
    db.add(d)
    db.commit()
    db.refresh(d)
    assert d.ativo is True


def test_multiplos_devices_por_maquina(db, maquina):
    db.add(WiseDevice(maquina_linha_id=maquina.id, ip="192.168.1.100", posicao="saida", ordem=1))
    db.add(WiseDevice(maquina_linha_id=maquina.id, ip="192.168.1.101", posicao="inspetor", ordem=2))
    db.add(WiseDevice(maquina_linha_id=maquina.id, ip="192.168.1.102", posicao="entrada", ordem=3))
    db.commit()
    db.refresh(maquina)
    assert len(maquina.wise_devices) == 3


def test_cascade_delete_devices(db, maquina):
    db.add(WiseDevice(maquina_linha_id=maquina.id, ip="192.168.1.100", posicao="saida", ordem=1))
    db.commit()
    db.delete(maquina)
    db.commit()
    devices = db.query(WiseDevice).all()
    assert len(devices) == 0


def test_wise_device_sem_maquina_falha(db):
    with pytest.raises(Exception):
        db.add(WiseDevice(ip="192.168.1.100", posicao="saida", ordem=1))
        db.commit()