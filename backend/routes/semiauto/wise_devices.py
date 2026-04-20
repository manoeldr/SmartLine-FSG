from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.maquina_linha import MaquinaLinha
from backend.models.semiauto.wise_device import WiseDevice
from backend.schemas.semiauto.wise_device import WiseDeviceCreate, WiseDeviceUpdate, WiseDeviceResponse

router = APIRouter(prefix="/linhas/{linha_id}/maquinas/{maquina_id}/wise/devices", tags=["wise_devices"])


# ============================================================
# HELPERS
# ============================================================

# Valida se a máquina existe e pertence à linha informada.
def _validar_maquina(linha_id: int, maquina_id: int, db: Session) -> MaquinaLinha:
    maquina = db.query(MaquinaLinha).filter(
        MaquinaLinha.id == maquina_id,
        MaquinaLinha.linha_id == linha_id,
    ).first()
    if not maquina:
        raise HTTPException(status_code=404, detail="Máquina não encontrada")
    return maquina


# Busca um device pelo ID e valida se pertence à máquina informada.
def _buscar_device(maquina_id: int, device_id: int, db: Session) -> WiseDevice:
    device = db.query(WiseDevice).filter(
        WiseDevice.id == device_id,
        WiseDevice.maquina_linha_id == maquina_id,
    ).first()
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo WISE não encontrado")
    return device


# ============================================================
# ROTAS
# ============================================================

# Lista todos os dispositivos WISE de uma máquina, ordenados por ordem.
@router.get("/", response_model=list[WiseDeviceResponse])
def listar_devices(linha_id: int, maquina_id: int, db: Session = Depends(get_db)):
    _validar_maquina(linha_id, maquina_id, db)
    return db.query(WiseDevice).filter(
        WiseDevice.maquina_linha_id == maquina_id
    ).order_by(WiseDevice.ordem).all()


# Cadastra um novo dispositivo WISE numa máquina.
# Não permite cadastrar o mesmo IP duas vezes na mesma máquina.
@router.post("/", response_model=WiseDeviceResponse)
def criar_device(linha_id: int, maquina_id: int, dados: WiseDeviceCreate, db: Session = Depends(get_db)):
    _validar_maquina(linha_id, maquina_id, db)

    existente = db.query(WiseDevice).filter(
        WiseDevice.maquina_linha_id == maquina_id,
        WiseDevice.ip == dados.ip,
    ).first()
    if existente:
        raise HTTPException(status_code=400, detail="Este IP já está cadastrado nesta máquina")

    device = WiseDevice(maquina_linha_id=maquina_id, **dados.model_dump())
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


# Atualiza dados de um dispositivo WISE (IP, posição, ordem, ativo, credenciais).
@router.patch("/{device_id}", response_model=WiseDeviceResponse)
def atualizar_device(linha_id: int, maquina_id: int, device_id: int, dados: WiseDeviceUpdate, db: Session = Depends(get_db)):
    device = _buscar_device(maquina_id, device_id, db)
    if dados.ip is not None:
        device.ip = dados.ip
    if dados.posicao is not None:
        device.posicao = dados.posicao
    if dados.ordem is not None:
        device.ordem = dados.ordem
    if dados.ativo is not None:
        device.ativo = dados.ativo
    if dados.usuario is not None:
        device.usuario = dados.usuario
    if dados.senha is not None:
        device.senha = dados.senha
    db.commit()
    db.refresh(device)
    return device


# Remove um dispositivo WISE e todos os seus canais (cascade).
@router.delete("/{device_id}")
def deletar_device(linha_id: int, maquina_id: int, device_id: int, db: Session = Depends(get_db)):
    device = _buscar_device(maquina_id, device_id, db)
    db.delete(device)
    db.commit()
    return {"ok": True}


# Testa conectividade com o WISE via REST usando autenticação HTTP Basic.
# Chama GET /di_value/slot_0 que retorna todos os 8 canais de uma vez.
# Retorna ok=True com a lista de canais se o dispositivo respondeu corretamente.
@router.get("/{device_id}/ping")
def ping_device(linha_id: int, maquina_id: int, device_id: int, db: Session = Depends(get_db)):
    import httpx
    device = _buscar_device(maquina_id, device_id, db)
    try:
        url = f"http://{device.ip}/di_value/slot_0"
        resp = httpx.get(url, timeout=10.0, auth=(device.usuario, device.senha or ""))
        dados = resp.json()
        canais = dados.get("DIVal", [])
        return {
            "ok": True,
            "ip": device.ip,
            "canais": canais,
        }
    except Exception as e:
        return {"ok": False, "erro": str(e), "ip": device.ip}