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

# Importa todos os models necessários para o SQLAlchemy resolver os relacionamentos
import backend.models.cliente
import backend.models.linha
import backend.models.maquina_linha
import backend.models.semiauto.wise_device
import backend.models.semiauto.wise_channel
import backend.models.semiauto.wise_formula
import backend.models.semiauto.wise_raw

logger = logging.getLogger(__name__)

# Intervalo entre cada rodada de processamento (segundos)
PROCESS_INTERVAL = 10

# Janela de leituras para detecção de parada (segundos atrás)
WINDOW_SECONDS = 120


def _buscar_medicoes_ativas(db: Session) -> list[Medicao]:
    """
    Retorna todas as medições semi-automáticas ativas (sem timestamp_fim).
    Só processa medições do tipo semiautomatico.
    """
    return db.query(Medicao).filter(
        Medicao.tipo == "semiautomatico",
        Medicao.timestamp_fim.is_(None),
    ).all()


def _buscar_devices_da_maquina(db: Session, maquina_linha_id: int) -> list[WiseDevice]:
    """
    Retorna todos os dispositivos WISE ativos vinculados a uma máquina.
    """
    return db.query(WiseDevice).filter(
        WiseDevice.maquina_linha_id == maquina_linha_id,
        WiseDevice.ativo == True,
    ).all()


def _buscar_canais_ativos(db: Session, device_id: int) -> list[WiseChannel]:
    """
    Retorna todos os canais ativos de um dispositivo WISE.
    """
    return db.query(WiseChannel).filter(
        WiseChannel.device_id == device_id,
        WiseChannel.ativo == True,
    ).all()


def _buscar_formulas(db: Session, maquina_linha_id: int) -> list[WiseFormula]:
    """
    Retorna todas as fórmulas configuradas para uma máquina.
    """
    return db.query(WiseFormula).filter(
        WiseFormula.maquina_linha_id == maquina_linha_id,
    ).all()


def _ultimo_estado_maquina(db: Session, medicao_id: int) -> str:
    """
    Retorna o último estado registrado da máquina ('rodando' ou 'parado').
    Considera o evento mais recente de marcha ou parada.
    """
    ultimo = db.query(Evento).filter(
        Evento.medicao_id == medicao_id,
        Evento.tipo.in_(["marcha", "parada"]),
    ).order_by(Evento.timestamp.desc()).first()

    if not ultimo:
        return "rodando"  # estado inicial padrão
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
    Evita registrar eventos duplicados verificando o estado atual.

    Parâmetros:
        novo_estado: "rodando" ou "parado"
        origem: descrição da origem para o motivo (ex: "DI canal 3", "Counter canal 1")
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

    Busca as leituras recentes do canal na janela WINDOW_SECONDS,
    detecta o estado atual usando detectar_estado_di() do calculations.py,
    e gera evento de parada ou marcha se houve transição de estado.
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
    Detecta marcha/parada usando um canal Counter.

    Se o valor do counter não incrementou nos últimos
    tempo_sem_alteracao_segundos → considera parada.
    Quando voltar a incrementar → marcha.

    Isso permite usar um único sensor counter tanto para
    contagem de produção quanto para detecção de parada.
    """
    threshold = canal.tempo_sem_alteracao_segundos or 30
    janela_inicio = agora - timedelta(seconds=threshold)

    # Primeira leitura na janela
    primeira = db.query(WiseRaw).filter(
        WiseRaw.channel_id == canal.id,
        WiseRaw.timestamp >= janela_inicio,
    ).order_by(WiseRaw.timestamp.asc()).first()

    # Última leitura na janela
    ultima = db.query(WiseRaw).filter(
        WiseRaw.channel_id == canal.id,
        WiseRaw.timestamp <= agora,
    ).order_by(WiseRaw.timestamp.desc()).first()

    if not primeira or not ultima:
        return

    delta = calcular_delta_counter(ultima.valor, primeira.valor)

    # Delta None = reset do counter — ignora
    if delta is None:
        return

    # Se o counter não incrementou na janela → parada
    # Se incrementou → rodando
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

    Um slot horário é definido como o intervalo completo de 1 hora
    contado a partir do início da medição (igual ao slot da medição manual).
    Só processa se o slot atual ainda não foi registrado.

    Para cada fórmula configurada:
        1. Calcula o delta de cada counter no slot
        2. Aplica o multiplicador_produto da máquina
        3. Aplica a fórmula (ex: saida - inspetor)
        4. Grava evento de producao com o resultado acumulado
    """
    interval_ms = 3_600_000  # 1 hora em ms
    elapsed_ms = (agora - medicao.timestamp_inicio).total_seconds() * 1000
    slot_atual = int(elapsed_ms // interval_ms)

    if slot_atual < 1:
        return  # ainda não completou o primeiro slot

    # Verifica quantos slots já foram processados
    num_eventos_producao = db.query(Evento).filter(
        Evento.medicao_id == medicao.id,
        Evento.tipo == "producao",
    ).count()

    if num_eventos_producao >= slot_atual:
        return  # slot já processado

    # Define a janela do slot a processar
    slot_inicio = medicao.timestamp_inicio + timedelta(hours=num_eventos_producao)
    slot_fim = slot_inicio + timedelta(hours=1)

    # Busca o multiplicador de produto da máquina
    maquina = db.query(MaquinaLinha).filter(
        MaquinaLinha.id == medicao.maquina_linha_id
    ).first()
    multiplicador = (maquina.multiplicador_produto or 1.0) if maquina else 1.0

    # Monta dict de deltas por posição: {posicao: delta_total_no_slot}
    deltas_por_posicao: dict[str, float] = {}

    for device in devices:
        canais_counter = db.query(WiseChannel).filter(
            WiseChannel.device_id == device.id,
            WiseChannel.tipo == "Counter",
            WiseChannel.funcao == "contagem",
            WiseChannel.ativo == True,
        ).all()

        for canal in canais_counter:
            # Primeira leitura do slot
            primeira = db.query(WiseRaw).filter(
                WiseRaw.channel_id == canal.id,
                WiseRaw.timestamp >= slot_inicio,
            ).order_by(WiseRaw.timestamp.asc()).first()

            # Última leitura do slot
            ultima = db.query(WiseRaw).filter(
                WiseRaw.channel_id == canal.id,
                WiseRaw.timestamp <= slot_fim,
            ).order_by(WiseRaw.timestamp.desc()).first()

            if not primeira or not ultima:
                continue

            delta = calcular_delta_counter(ultima.valor, primeira.valor)
            if delta is None:
                logger.warning(
                    f"[wise_processor] Delta negativo no canal {canal.id} "
                    f"(possível reset do counter) — slot ignorado"
                )
                continue

            # Aplica o multiplicador de produto antes de associar à posição
            delta_ajustado = delta * multiplicador
            posicao = device.posicao
            deltas_por_posicao[posicao] = deltas_por_posicao.get(posicao, 0.0) + delta_ajustado

    if not deltas_por_posicao:
        return

    # Aplica cada fórmula e registra evento de producao
    for formula in formulas:
        try:
            operacoes = json.loads(formula.operacoes)
        except Exception:
            logger.error(f"[wise_processor] Fórmula {formula.id} com JSON inválido")
            continue

        resultado = aplicar_formula(operacoes, deltas_por_posicao)
        if resultado is None:
            logger.warning(
                f"[wise_processor] Fórmula {formula.id} ({formula.resultado}) "
                f"— posição ausente nos deltas, slot ignorado"
            )
            continue

        # Produção acumulada = producao_inicial + resultado do slot
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
            f"{formula.resultado}: {int(resultado)} unidades "
            f"(multiplicador: {multiplicador})"
        )


def _processar_medicao(db: Session, medicao: Medicao, agora: datetime) -> None:
    """
    Processa uma medição semi-automática ativa.

    Para cada canal de cada device:
        - DI com funcao=marcha_parada → detectar_estado_di
        - Counter com funcao=contagem → detecção de parada por ausência de incremento
    Depois calcula a produção do slot horário se aplicável.
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
                # Counter também detecta marcha/parada pela ausência de incremento
                _processar_counter_marcha_parada(db, medicao, canal, agora)

    if formulas:
        _processar_producao_slot(db, medicao, devices, formulas, agora)

    db.commit()


def _processar_todos() -> None:
    """
    Busca todas as medições semi-automáticas ativas e processa cada uma.
    Usa uma sessão por rodada para evitar conexões abertas por muito tempo.
    """
    db: Session = SessionLocal()
    agora = datetime.now()
    try:
        medicoes = _buscar_medicoes_ativas(db)
        for medicao in medicoes:
            try:
                _processar_medicao(db, medicao, agora)
            except Exception as e:
                logger.error(f"[wise_processor] Erro ao processar medição {medicao.id}: {e}")
                db.rollback()
    except Exception as e:
        logger.error(f"[wise_processor] Erro na rodada de processamento: {e}")
    finally:
        db.close()


def iniciar_processor() -> None:
    """
    Loop principal do worker de tratamento. Roda indefinidamente
    com intervalo PROCESS_INTERVAL segundos.
    Projetado para rodar em thread daemon.
    """
    logger.info(f"[wise_processor] Iniciando processamento a cada {PROCESS_INTERVAL}s")
    while True:
        try:
            _processar_todos()
        except Exception as e:
            logger.error(f"[wise_processor] Erro inesperado: {e}")
        time.sleep(PROCESS_INTERVAL)