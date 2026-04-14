# ============================================================
# CALCULATIONS.PY — Cálculos de indicadores de produção
# Fonte única de verdade para OEE, MTBF, MTTR, disponibilidade,
# performance e eficiência. Usado por routes e endpoints.
# ============================================================

from datetime import datetime
from typing import Optional


def calcular_indicadores(
    eventos: list,
    timestamp_inicio: datetime,
    timestamp_fim: Optional[datetime],
    producao_inicial: int,
    velocidade_nominal: float,
) -> dict:
    """
    Calcula todos os indicadores de uma medição a partir dos eventos.

    Parâmetros:
        eventos: lista de objetos Evento ordenados por timestamp
        timestamp_inicio: início da medição
        timestamp_fim: fim da medição (None = medição ativa, usa agora)
        producao_inicial: leitura inicial do contador
        velocidade_nominal: velocidade nominal da máquina (unidades/hora)

    Retorna dict com:
        elapsed_ms, running_ms, stopped_ms,
        num_paradas, disponibilidade, performance, oee,
        mtbf_ms, mttr_ms, producao, eficiencia
    """
    agora = datetime.now()
    fim = timestamp_fim or agora
    elapsed_ms = (fim - timestamp_inicio).total_seconds() * 1000

    stopped_ms = 0.0
    stop_time = None
    num_paradas = 0
    ultimo_estado = "rodando"

    for ev in eventos:
        if ev.tipo == "parada":
            stop_time = ev.timestamp
            num_paradas += 1
            ultimo_estado = "parado"
        elif ev.tipo == "marcha" and stop_time:
            stopped_ms += (ev.timestamp - stop_time).total_seconds() * 1000
            stop_time = None
            ultimo_estado = "rodando"

    # Parada ainda em curso (medição ativa)
    if stop_time and not timestamp_fim:
        stopped_ms += (agora - stop_time).total_seconds() * 1000

    running_ms = max(0.0, elapsed_ms - stopped_ms)

    # ── Disponibilidade ──────────────────────────────────────
    # Tempo rodando / Tempo total
    disponibilidade = (running_ms / elapsed_ms * 100) if elapsed_ms > 0 else 0.0

    # ── Produção líquida ─────────────────────────────────────
    # Última leitura de produção - leitura inicial
    producao_eventos = [
        e for e in eventos
        if e.tipo == "producao" and e.producao_leitura is not None
    ]
    ultima_leitura = (
        producao_eventos[-1].producao_leitura
        if producao_eventos
        else producao_inicial
    )
    producao = ultima_leitura - producao_inicial

    # ── Performance ──────────────────────────────────────────
    # Produção real / Produção esperada no tempo rodando
    running_horas = running_ms / 3_600_000
    producao_esperada = running_horas * (velocidade_nominal or 1)
    performance = (
        min((producao / producao_esperada) * 100, 100)
        if producao_esperada > 0
        else 0.0
    )

    # ── OEE ──────────────────────────────────────────────────
    # Disponibilidade × Performance (qualidade = 100% por ora)
    oee = (disponibilidade / 100) * (performance / 100) * 100

    # ── MTBF e MTTR ──────────────────────────────────────────
    # MTBF: tempo médio entre falhas (tempo rodando / nº paradas)
    # MTTR: tempo médio de reparo (tempo parado / nº paradas)
    mtbf_ms = (running_ms / num_paradas) if num_paradas > 0 else None
    mttr_ms = (stopped_ms / num_paradas) if num_paradas > 0 else None

    return {
        "elapsed_ms": round(elapsed_ms),
        "running_ms": round(running_ms),
        "stopped_ms": round(stopped_ms),
        "num_paradas": num_paradas,
        "ultimo_estado": ultimo_estado,
        "producao": producao,
        "disponibilidade": round(disponibilidade, 1),
        "performance": round(performance, 1),
        "oee": round(oee, 1),
        "eficiencia": round(disponibilidade, 1),  # alias para disponibilidade
        "mtbf_ms": round(mtbf_ms) if mtbf_ms is not None else None,
        "mttr_ms": round(mttr_ms) if mttr_ms is not None else None,
    }


def calcular_paradas_por_motivo(eventos: list, timestamp_fim: Optional[datetime]) -> list:
    """
    Agrupa paradas por motivo com duração e percentual.

    Retorna lista de dicts:
        motivo, count, total_ms, percentual
    """
    agora = datetime.now()
    fim = timestamp_fim or agora

    by_motivo = {}
    for i, ev in enumerate(eventos):
        if ev.tipo != "parada":
            continue
        motivo = ev.motivo or "Não informado"
        # Próximo evento de marcha após esta parada
        prox_marcha = next(
            (e for j, e in enumerate(eventos) if j > i and e.tipo == "marcha"),
            None
        )
        end = prox_marcha.timestamp if prox_marcha else fim
        duration_ms = (end - ev.timestamp).total_seconds() * 1000

        if motivo not in by_motivo:
            by_motivo[motivo] = {"count": 0, "total_ms": 0.0}
        by_motivo[motivo]["count"] += 1
        by_motivo[motivo]["total_ms"] += duration_ms

    total_ms = sum(v["total_ms"] for v in by_motivo.values())

    return [
        {
            "motivo": motivo,
            "count": data["count"],
            "total_ms": round(data["total_ms"]),
            "percentual": round((data["total_ms"] / total_ms * 100), 1) if total_ms > 0 else 0,
        }
        for motivo, data in sorted(by_motivo.items(), key=lambda x: -x[1]["total_ms"])
    ]