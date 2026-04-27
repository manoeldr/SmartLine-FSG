# ============================================================
# WISE_WORKER.PY — Worker de polling dos dispositivos WISE
# Roda em thread separada, lê os canais de cada WISE ativo
# a cada POLL_INTERVAL segundos e grava os dados brutos no banco.
# ============================================================

import time
import logging
from datetime import datetime

import httpx
from sqlalchemy.orm import Session

from backend.database import SessionLocal

# ── Imports de todos os models ───────────────────────────────
# Obrigatório importar TODOS antes de qualquer query para que o
# SQLAlchemy consiga resolver os relacionamentos entre as tabelas.
# A ausência de qualquer model aqui causa KeyError silencioso.
import backend.models.cliente
import backend.models.linha
import backend.models.maquina_linha
import backend.models.medicao
import backend.models.evento
import backend.models.semiauto.wise_device
import backend.models.semiauto.wise_channel
import backend.models.semiauto.wise_formula
import backend.models.semiauto.wise_raw

from backend.models.semiauto.wise_device import WiseDevice
from backend.models.semiauto.wise_channel import WiseChannel
from backend.models.semiauto.wise_raw import WiseRaw

logger = logging.getLogger(__name__)

POLL_INTERVAL = 5
REQUEST_TIMEOUT = 8.0


def _poll_device(db: Session, device: WiseDevice) -> None:
    """
    Faz uma requisição ao WISE e grava os valores de cada canal ativo
    configurado no banco como registros brutos em wise_raw.
    """
    url = f"http://{device.ip}/di_value/slot_0"
    try:
        resp = httpx.get(
            url,
            auth=(device.usuario, device.senha or ""),
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            logger.warning(f"[wise_worker] {device.ip} retornou {resp.status_code}")
            return

        dados = resp.json()
        canais_wise = {c["Ch"]: c for c in dados.get("DIVal", [])}

    except Exception as e:
        logger.warning(f"[wise_worker] Erro ao conectar em {device.ip}: {e}")
        return

    canais_config = db.query(WiseChannel).filter(
        WiseChannel.device_id == device.id,
        WiseChannel.ativo == True,
    ).all()

    agora = datetime.now()

    for canal in canais_config:
        dado_wise = canais_wise.get(canal.numero_canal)
        if dado_wise is None:
            logger.warning(
                f"[wise_worker] Canal {canal.numero_canal} não encontrado na resposta de {device.ip}"
            )
            continue

        if canal.tipo == "DI":
            valor = float(dado_wise.get("Stat", 0))
        else:
            valor = float(dado_wise.get("Val", 0))

        raw = WiseRaw(
            maquina_linha_id=device.maquina_linha_id,
            device_id=device.id,
            channel_id=canal.id,
            tipo=canal.tipo,
            funcao=canal.funcao,
            valor=valor,
            timestamp=agora,
            processado=False,
        )
        db.add(raw)

    db.commit()


def _poll_todos() -> None:
    """
    Busca todos os devices ativos no banco e faz polling de cada um.
    """
    db: Session = SessionLocal()
    try:
        devices = db.query(WiseDevice).filter(WiseDevice.ativo == True).all()
        for device in devices:
            _poll_device(db, device)
    except Exception as e:
        logger.error(f"[wise_worker] Erro na rodada de polling: {e}")
    finally:
        db.close()


def iniciar_worker() -> None:
    """
    Loop principal do worker. Roda indefinidamente com intervalo POLL_INTERVAL.
    Projetado para rodar em thread daemon.
    """
    logger.info(f"[wise_worker] Iniciando polling a cada {POLL_INTERVAL}s")
    while True:
        try:
            _poll_todos()
        except Exception as e:
            logger.error(f"[wise_worker] Erro inesperado: {e}")
        time.sleep(POLL_INTERVAL)