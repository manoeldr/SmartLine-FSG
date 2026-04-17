import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.database import Base
from backend.models.cliente import Cliente
from backend.models.linha import Linha
from backend.models.maquina_linha import MaquinaLinha
from backend.models.semiauto.wise_device import WiseDevice
from backend.models.semiauto.wise_channel import WiseChannel
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
def device(db):
    c = Cliente(nome="Sanmartin")
    db.add(c)
    db.commit()
    l = Linha(nome="Linha 1", cliente_id=c.id)
    db.add(l)
    db.commit()
    m = MaquinaLinha(nome="Enchedora", ordem=1, linha_id=l.id)
    db.add(m)
    db.commit()
    d = WiseDevice(maquina_linha_id=m.id, ip="192.168.1.100", posicao="saida", ordem=1)
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


def test_criar_channel_di(db, device):
    ch = WiseChannel(
        device_id=device.id,
        numero_canal=0,
        tipo="DI",
        funcao="marcha_parada",
        ativo=True,
    )
    db.add(ch)
    db.commit()
    db.refresh(ch)
    assert ch.id is not None
    assert ch.tipo == "DI"
    assert ch.funcao == "marcha_parada"
    assert ch.alarme_motivo is None


def test_criar_channel_counter(db, device):
    ch = WiseChannel(
        device_id=device.id,
        numero_canal=1,
        tipo="Counter",
        funcao="contagem",
    )
    db.add(ch)
    db.commit()
    db.refresh(ch)
    assert ch.tipo == "Counter"
    assert ch.funcao == "contagem"


def test_criar_channel_alarme(db, device):
    ch = WiseChannel(
        device_id=device.id,
        numero_canal=2,
        tipo="DI",
        funcao="alarme",
        alarme_motivo="Falta de embalagem",
    )
    db.add(ch)
    db.commit()
    db.refresh(ch)
    assert ch.funcao == "alarme"
    assert ch.alarme_motivo == "Falta de embalagem"


def test_multiplos_channels_por_device(db, device):
    db.add(WiseChannel(device_id=device.id, numero_canal=0, tipo="DI", funcao="marcha_parada"))
    db.add(WiseChannel(device_id=device.id, numero_canal=1, tipo="Counter", funcao="contagem"))
    db.add(WiseChannel(device_id=device.id, numero_canal=2, tipo="DI", funcao="alarme", alarme_motivo="Alarme X"))
    db.commit()
    db.refresh(device)
    assert len(device.canais) == 3


def test_cascade_delete_channels(db, device):
    db.add(WiseChannel(device_id=device.id, numero_canal=0, tipo="DI", funcao="marcha_parada"))
    db.commit()
    db.delete(device)
    db.commit()
    canais = db.query(WiseChannel).all()
    assert len(canais) == 0


def test_channel_sem_device_falha(db):
    with pytest.raises(Exception):
        db.add(WiseChannel(numero_canal=0, tipo="DI", funcao="marcha_parada"))
        db.commit()