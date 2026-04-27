# ============================================================
# WISE_PROCESSOR.PY — Worker de tratamento dos dados brutos WISE
# Lê os registros de wise_raw, processa eventos de marcha/parada
# e calcula produção por slot horário para medições semi-automáticas.
# Roda em thread separada com intervalo de PROCESS_INTERVAL segundos.
#
# Detecção de marcha/parada:
#   - Canal DI: usa detectar_estado_di() — sinal estático por X segundos = parada
#   - Canal Counter: se o valor não incrementou por tempo_sem_alteracao_segundos = parada
#
# Produção:
#   - Delta do counter no slot × multiplicador_produto da máquina
#   - Resultado aplicado pela fórmula configurada (ex: saida - inspetor)
# ============================================================

import json
import time
import logging
from datetime import datetime, timedelta
from typing import Optional

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

from backend.models.medicao import Medicao
from backend.models.evento import Evento
from backend.models.maquina_linha import MaquinaLinha
from backend.models.semiauto.wise_device import WiseDevice
from backend.models.semiauto.wise_channel import WiseChannel
from backend.models.semiauto.wise_formula import WiseFormula
from backend.models.semiauto.wise_raw import WiseRaw
from backend.calculations import (
    calcular_delta_counter,
    aplicar_formula,
    detectar_estado_di,
)

logger = logging.getLogger(__name__)

PROCESS_INTERVAL = 10
WINDOW_SECONDS = 120


def _buscar_medicoes_ativas(db: Session) -> list[Medicao]:
    """Retorna todas as medições semi-automáticas ativas (sem timestamp_fim)."""
    return db.query(Medicao).filter(
        Medicao.tipo == "semiautomatico",
        Medicao.timestamp_fim.is_(None),
    ).all()


def _buscar_devices_da_maquina(db: Session, maquina_linha_id: int) -> list[WiseDevice]:
    """Retorna todos os dispositivos WISE ativos vinculados a uma máquina."""
    return db.query(WiseDevice).filter(
        WiseDevice.maquina_linha_id == maquina_linha_id,
        WiseDevice.ativo == True,
    ).all()


def _buscar_canais_ativos(db: Session, device_id: int) -> list[WiseChannel]:
    """Retorna todos os canais ativos de um dispositivo WISE."""
    return db.query(WiseChannel).filter(
        WiseChannel.device_id == device_id,
        WiseChannel.ativo == True,
    ).all()


def _buscar_formulas(db: Session, maquina_linha_id: int) -> list[WiseFormula]:
    """Retorna todas as fórmulas configuradas para uma máquina."""
    return db.query(WiseFormula).filter(
        WiseFormula.maquina_linha_id == maquina_linha_id,
    ).all()


def _ultimo_estado_maquina(db: Session, medicao_id: int) -> str:
    """
    Retorna o último estado registrado da máquina ('rodando' ou 'parado').
    Estado inicial padrão é 'rodando'.
    """
    ultimo = db.query(Evento).filter(
        Evento.medicao_id == medicao_id,
        Evento.tipo.in_(["marcha", "parada"]),
    ).order_by(Evento.timestamp.desc()).first()

    if not ultimo:
        return "rodando"
    return "parado" if ultimo.tipo == "parada" else "rodando"


def _registrar_transicao(
    db: Session,
    medicao: Medicao,
    novo_estado: str,
    agora: datetime,
    origem: str,
) -> None:
    """
    Registra evento de marcha ou parada se houve transição de estado.
    Evita duplicatas verificando o estado atual antes de inserir.
    """
    estado_atual = _ultimo_estado_maquina(db, medicao.id)

    if novo_estado == "parado" and estado_atual == "rodando":
        evento = Evento(
            medicao_id=medicao.id,
            tipo="parada",
            timestamp=agora,
            motivo=f"Parada detectada automaticamente (WISE — {origem})",
        )
        db.add(evento)
        logger.info(f"[wise_processor] Medicao {medicao.id} — parada via {origem}")

    elif novo_estado == "rodando" and estado_atual == "parado":
        evento = Evento(
            medicao_id=medicao.id,
            tipo="marcha",
            timestamp=agora,
        )
        db.add(evento)
        logger.info(f"[wise_processor] Medicao {medicao.id} — marcha via {origem}")


def _processar_di(
    db: Session,
    medicao: Medicao,
    canal: WiseChannel,
    agora: datetime,
) -> None:
    """
    Processa um canal DI de marcha/parada.
    Busca leituras na janela WINDOW_SECONDS e detecta estado via detectar_estado_di().
    """
    janela_inicio = agora - timedelta(seconds=WINDOW_SECONDS)

    leituras = db.query(WiseRaw).filter(
        WiseRaw.channel_id == canal.id,
        WiseRaw.timestamp >= janela_inicio,
        WiseRaw.timestamp <= agora,
    ).order_by(WiseRaw.timestamp.asc()).all()

    if not leituras:
        return

    leituras_dict = [{"valor": r.valor, "timestamp": r.timestamp} for r in leituras]
    threshold = canal.tempo_sem_alteracao_segundos or 30
    novo_estado = detectar_estado_di(leituras_dict, threshold, agora)

    if novo_estado is None:
        return

    _registrar_transicao(db, medicao, novo_estado, agora, f"DI canal {canal.numero_canal}")


def _processar_counter_marcha_parada(
    db: Session,
    medicao: Medicao,
    canal: WiseChannel,
    agora: datetime,
) -> None:
    """
    Detecta marcha/parada por ausência de incremento no counter.
    Se delta == 0 no período threshold → parada. Se > 0 → rodando.
    """
    threshold = canal.tempo_sem_alteracao_segundos or 30
    janela_inicio = agora - timedelta(seconds=threshold)

    primeira = db.query(WiseRaw).filter(
        WiseRaw.channel_id == canal.id,
        WiseRaw.timestamp >= janela_inicio,
    ).order_by(WiseRaw.timestamp.asc()).first()

    ultima = db.query(WiseRaw).filter(
        WiseRaw.channel_id == canal.id,
        WiseRaw.timestamp <= agora,
    ).order_by(WiseRaw.timestamp.desc()).first()

    if not primeira or not ultima:
        return

    delta = calcular_delta_counter(ultima.valor, primeira.valor)
    if delta is None:
        return

    novo_estado = "parado" if delta == 0 else "rodando"
    _registrar_transicao(db, medicao, novo_estado, agora, f"Counter canal {canal.numero_canal}")


def _processar_producao_slot(
    db: Session,
    medicao: Medicao,
    devices: list[WiseDevice],
    formulas: list[WiseFormula],
    agora: datetime,
) -> None:
    """
    Calcula e registra a produção do slot horário atual.
    Slot = intervalo de 1 hora a partir do início da medição.
    Só processa se o slot atual ainda não foi registrado.
    """
    interval_ms = 3_600_000
    elapsed_ms = (agora - medicao.timestamp_inicio).total_seconds() * 1000
    slot_atual = int(elapsed_ms // interval_ms)

    if slot_atual < 1:
        return

    num_eventos_producao = db.query(Evento).filter(
        Evento.medicao_id == medicao.id,
        Evento.tipo == "producao",
    ).count()

    if num_eventos_producao >= slot_atual:
        return

    slot_inicio = medicao.timestamp_inicio + timedelta(hours=num_eventos_producao)
    slot_fim = slot_inicio + timedelta(hours=1)

    maquina = db.query(MaquinaLinha).filter(
        MaquinaLinha.id == medicao.maquina_linha_id
    ).first()
    multiplicador = (maquina.multiplicador_produto or 1.0) if maquina else 1.0

    deltas_por_posicao: dict[str, float] = {}

    for device in devices:
        canais_counter = db.query(WiseChannel).filter(
            WiseChannel.device_id == device.id,
            WiseChannel.tipo == "Counter",
            WiseChannel.funcao == "contagem",
            WiseChannel.ativo == True,
        ).all()

        for canal in canais_counter:
            primeira = db.query(WiseRaw).filter(
                WiseRaw.channel_id == canal.id,
                WiseRaw.timestamp >= slot_inicio,
            ).order_by(WiseRaw.timestamp.asc()).first()

            ultima = db.query(WiseRaw).filter(
                WiseRaw.channel_id == canal.id,
                WiseRaw.timestamp <= slot_fim,
            ).order_by(WiseRaw.timestamp.desc()).first()

            if not primeira or not ultima:
                continue

            delta = calcular_delta_counter(ultima.valor, primeira.valor)
            if delta is None:
                logger.warning(
                    f"[wise_processor] Delta negativo no canal {canal.id} — slot ignorado"
                )
                continue

            delta_ajustado = delta * multiplicador
            posicao = device.posicao
            deltas_por_posicao[posicao] = deltas_por_posicao.get(posicao, 0.0) + delta_ajustado

    if not deltas_por_posicao:
        return

    for formula in formulas:
        try:
            operacoes = json.loads(formula.operacoes)
        except Exception:
            logger.error(f"[wise_processor] Fórmula {formula.id} com JSON inválido")
            continue

        resultado = aplicar_formula(operacoes, deltas_por_posicao)
        if resultado is None:
            logger.warning(
                f"[wise_processor] Fórmula {formula.id} — posição ausente nos deltas, slot ignorado"
            )
            continue

        producao_acumulada = (medicao.producao_inicial or 0) + int(resultado)

        evento = Evento(
            medicao_id=medicao.id,
            tipo="producao",
            timestamp=slot_fim,
            producao_leitura=producao_acumulada,
            motivo=f"Slot {slot_atual} — {formula.resultado}",
        )
        db.add(evento)
        logger.info(
            f"[wise_processor] Medicao {medicao.id} — slot {slot_atual} "
            f"{formula.resultado}: {int(resultado)} unidades"
        )


def _processar_medicao(db: Session, medicao: Medicao, agora: datetime) -> None:
    """
    Processa uma medição semi-automática ativa.
    Percorre canais de cada device e delega para _processar_di ou
    _processar_counter_marcha_parada conforme o tipo/função do canal.
    Depois tenta processar o slot de produção.
    """
    devices = _buscar_devices_da_maquina(db, medicao.maquina_linha_id)
    if not devices:
        return

    formulas = _buscar_formulas(db, medicao.maquina_linha_id)

    for device in devices:
        canais = _buscar_canais_ativos(db, device.id)
        for canal in canais:
            if canal.funcao == "marcha_parada" and canal.tipo == "DI":
                _processar_di(db, medicao, canal, agora)
            elif canal.funcao == "contagem" and canal.tipo == "Counter":
                _processar_counter_marcha_parada(db, medicao, canal, agora)

    if formulas:
        _processar_producao_slot(db, medicao, devices, formulas, agora)

    db.commit()


def _processar_todos() -> None:
    db: Session = SessionLocal()
    agora = datetime.now()
    try:
        medicoes = _buscar_medicoes_ativas(db)
        print(f"[wise_processor] Rodada — {len(medicoes)} medições ativas", flush=True)  # <-- adicionar
        for medicao in medicoes:
            try:
                _processar_medicao(db, medicao, agora)
            except Exception as e:
                logger.error(f"[wise_processor] Erro ao processar medição {medicao.id}: {e}")
                print(f"[wise_processor] ERRO medicao {medicao.id}: {e}", flush=True)  # <-- adicionar
                db.rollback()
    except Exception as e:
        logger.error(f"[wise_processor] Erro na rodada de processamento: {e}")
        print(f"[wise_processor] ERRO geral: {e}", flush=True)  # <-- adicionar
    finally:
        db.close()


def iniciar_processor() -> None:
    """
    Loop principal do worker de tratamento. Roda indefinidamente
    com intervalo PROCESS_INTERVAL segundos.
    Projetado para rodar em thread daemon.
    """
    logger.info(f"[wise_processor] Iniciando processamento a cada {PROCESS_INTERVAL}s")
    print(f"[wise_processor] Iniciando processamento a cada {PROCESS_INTERVAL}s", flush=True)
    while True:
        try:
            _processar_todos()
        except Exception as e:
            logger.error(f"[wise_processor] Erro inesperado: {e}")
        time.sleep(PROCESS_INTERVAL)