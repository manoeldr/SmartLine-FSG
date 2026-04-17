from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.semiauto.wise_device import WiseDevice
from backend.models.semiauto.wise_channel import WiseChannel
from backend.schemas.semiauto.wise_channel import WiseChannelCreate, WiseChannelUpdate, WiseChannelResponse

router = APIRouter(
    prefix="/linhas/{linha_id}/maquinas/{maquina_id}/wise/devices/{device_id}/channels",
    tags=["wise_channels"],
)


# ============================================================
# HELPERS
# ============================================================

# Valida se o device existe e pertence à máquina informada.
def _validar_device(maquina_id: int, device_id: int, db: Session) -> WiseDevice:
    device = db.query(WiseDevice).filter(
        WiseDevice.id == device_id,
        WiseDevice.maquina_linha_id == maquina_id,
    ).first()
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo WISE não encontrado")
    return device


# Busca um canal específico pelo ID e valida se pertence ao device informado.
def _buscar_channel(device_id: int, channel_id: int, db: Session) -> WiseChannel:
    canal = db.query(WiseChannel).filter(
        WiseChannel.id == channel_id,
        WiseChannel.device_id == device_id,
    ).first()
    if not canal:
        raise HTTPException(status_code=404, detail="Canal não encontrado")
    return canal


# ============================================================
# ROTAS
# ============================================================

# Retorna todos os canais configurados num dispositivo WISE, ordenados pelo número do canal.
@router.get("/", response_model=list[WiseChannelResponse])
def listar_channels(linha_id: int, maquina_id: int, device_id: int, db: Session = Depends(get_db)):
    _validar_device(maquina_id, device_id, db)
    return db.query(WiseChannel).filter(
        WiseChannel.device_id == device_id
    ).order_by(WiseChannel.numero_canal).all()


# Cadastra um novo canal num dispositivo WISE.
# Valida tipo (DI/Counter), função (marcha_parada/contagem/alarme),
# compatibilidade entre tipo e função, e unicidade do número do canal.
@router.post("/", response_model=WiseChannelResponse)
def criar_channel(linha_id: int, maquina_id: int, device_id: int, dados: WiseChannelCreate, db: Session = Depends(get_db)):
    _validar_device(maquina_id, device_id, db)

    if dados.tipo not in ("DI", "Counter"):
        raise HTTPException(status_code=422, detail="Tipo deve ser 'DI' ou 'Counter'")
    if dados.funcao not in ("marcha_parada", "contagem", "alarme"):
        raise HTTPException(status_code=422, detail="Função deve ser 'marcha_parada', 'contagem' ou 'alarme'")
    if dados.funcao == "alarme" and not dados.alarme_motivo:
        raise HTTPException(status_code=422, detail="alarme_motivo é obrigatório quando função é 'alarme'")
    if dados.funcao == "marcha_parada" and dados.tipo != "DI":
        raise HTTPException(status_code=422, detail="Função 'marcha_parada' requer tipo 'DI'")
    if dados.funcao == "contagem" and dados.tipo != "Counter":
        raise HTTPException(status_code=422, detail="Função 'contagem' requer tipo 'Counter'")

    existente = db.query(WiseChannel).filter(
        WiseChannel.device_id == device_id,
        WiseChannel.numero_canal == dados.numero_canal,
    ).first()
    if existente:
        raise HTTPException(status_code=400, detail=f"Canal {dados.numero_canal} já cadastrado neste dispositivo")

    canal = WiseChannel(device_id=device_id, **dados.model_dump())
    db.add(canal)
    db.commit()
    db.refresh(canal)
    return canal


# Atualiza a configuração de um canal existente (tipo, função, motivo de alarme, ativo).
@router.patch("/{channel_id}", response_model=WiseChannelResponse)
def atualizar_channel(linha_id: int, maquina_id: int, device_id: int, channel_id: int, dados: WiseChannelUpdate, db: Session = Depends(get_db)):
    canal = _buscar_channel(device_id, channel_id, db)
    if dados.tipo is not None:
        canal.tipo = dados.tipo
    if dados.funcao is not None:
        canal.funcao = dados.funcao
    if dados.alarme_motivo is not None:
        canal.alarme_motivo = dados.alarme_motivo
    if dados.ativo is not None:
        canal.ativo = dados.ativo
    db.commit()
    db.refresh(canal)
    return canal


# Remove um canal do dispositivo WISE.
@router.delete("/{channel_id}")
def deletar_channel(linha_id: int, maquina_id: int, device_id: int, channel_id: int, db: Session = Depends(get_db)):
    canal = _buscar_channel(device_id, channel_id, db)
    db.delete(canal)
    db.commit()
    return {"ok": True}