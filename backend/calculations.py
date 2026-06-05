# ============================================================
# CALCULATIONS.PY — Cálculos de indicadores de produção
# Fonte única de verdade para OEE, MTBF, MTTR, disponibilidade,
# performance e eficiência. Usado por routes e endpoints.
# ============================================================

from datetime import datetime, timedelta
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

    Paradas são separadas por categoria:
        - Interna (ou sem categoria): penaliza disponibilidade e OEE
        - Externa: registrada em stopped_externo_ms, não penaliza OEE

    Parâmetros:
        eventos: lista de objetos Evento ordenados por timestamp
        timestamp_inicio: início da medição
        timestamp_fim: fim da medição (None = medição ativa, usa agora)
        producao_inicial: leitura inicial do contador
        velocidade_nominal: velocidade nominal da máquina (unidades/hora)

    Retorna dict com:
        elapsed_ms, running_ms, stopped_ms, stopped_externo_ms, pausa_ms,
        num_paradas, num_paradas_internas, num_paradas_externas,
        disponibilidade, performance, qualidade, oee,
        mtbf_ms, mttr_ms, producao, refugo, eficiencia
    """
    agora = datetime.now()
    fim = timestamp_fim or agora
    total_ms = (fim - timestamp_inicio).total_seconds() * 1000

    # Paradas internas — penalizam OEE
    stopped_ms = 0.0
    # Paradas externas — registradas mas não penalizam OEE
    stopped_externo_ms = 0.0
    # Pausas programadas — descontadas do elapsed
    pausa_ms = 0.0

    stop_time = None
    stop_categoria = None
    pausa_time = None
    num_paradas = 0
    num_paradas_internas = 0
    num_paradas_externas = 0
    ultimo_estado = "rodando"

    # Intervalos de funcionamento entre paradas consecutivas (para MTBF)
    intervalos_funcionamento = []
    ultimo_fim_parada = None

    for ev in eventos:
        if ev.tipo == "parada":
            if ultimo_fim_parada is not None:
                intervalos_funcionamento.append(
                    (ev.timestamp - ultimo_fim_parada).total_seconds() * 1000
                )
            stop_time = ev.timestamp
            stop_categoria = ev.categoria or "Interna"  # default: Interna
            num_paradas += 1
            if stop_categoria == "Externa":
                num_paradas_externas += 1
            else:
                num_paradas_internas += 1
            ultimo_estado = "parado"

        elif ev.tipo == "marcha" and stop_time:
            duracao = (ev.timestamp - stop_time).total_seconds() * 1000
            if stop_categoria == "Externa":
                stopped_externo_ms += duracao
            else:
                stopped_ms += duracao
            ultimo_fim_parada = ev.timestamp
            stop_time = None
            stop_categoria = None
            ultimo_estado = "rodando"

        elif ev.tipo == "pausa":
            pausa_time = ev.timestamp
            ultimo_estado = "pausado"

        elif ev.tipo == "retomada" and pausa_time:
            pausa_ms += (ev.timestamp - pausa_time).total_seconds() * 1000
            pausa_time = None
            ultimo_estado = "rodando"

    # Parada ainda em curso (medição ativa)
    if stop_time and not timestamp_fim:
        duracao = (agora - stop_time).total_seconds() * 1000
        if stop_categoria == "Externa":
            stopped_externo_ms += duracao
        else:
            stopped_ms += duracao

    # Pausa ainda em curso (medição ativa)
    if pausa_time and not timestamp_fim:
        pausa_ms += (agora - pausa_time).total_seconds() * 1000

    # elapsed_ms desconta pausas programadas
    elapsed_ms = max(0.0, total_ms - pausa_ms)
    running_ms = max(0.0, elapsed_ms - stopped_ms - stopped_externo_ms)

    # ── Disponibilidade ──────────────────────────────────────
    # Usa apenas paradas internas — externas não penalizam
    running_interno_ms = max(0.0, elapsed_ms - stopped_ms)
    disponibilidade = (running_interno_ms / elapsed_ms * 100) if elapsed_ms > 0 else 0.0

    # ── Produção líquida ─────────────────────────────────────
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

    # ── Refugo líquido ───────────────────────────────────────
    refugo = 0
    refugo_anterior = 0
    for ev in producao_eventos:
        if ev.refugo_leitura is not None:
            delta_refugo = ev.refugo_leitura - refugo_anterior
            if delta_refugo > 0:
                refugo += delta_refugo
            refugo_anterior = ev.refugo_leitura

    # ── Performance ──────────────────────────────────────────
    # Produção real / Produção esperada no tempo rodando interno
    running_horas = running_interno_ms / 3_600_000
    producao_esperada = running_horas * (velocidade_nominal or 1)
    performance = (
        min((producao / producao_esperada) * 100, 100)
        if producao_esperada > 0
        else 0.0
    )

    # ── Qualidade ────────────────────────────────────────────
    if producao > 0 and refugo > 0:
        qualidade = max(0.0, ((producao - refugo) / producao) * 100)
    else:
        qualidade = 100.0

    # ── OEE ──────────────────────────────────────────────────
    oee = (disponibilidade / 100) * (performance / 100) * (qualidade / 100) * 100

    # ── MTBF ─────────────────────────────────────────────────
    # Média dos intervalos de funcionamento entre paradas consecutivas
    if len(intervalos_funcionamento) >= 1:
        mtbf_ms = sum(intervalos_funcionamento) / len(intervalos_funcionamento)
    else:
        mtbf_ms = None

    # ── MTTR ─────────────────────────────────────────────────
    # Tempo médio de reparo — considera apenas paradas internas
    mttr_ms = (stopped_ms / num_paradas_internas) if num_paradas_internas > 0 else None

    return {
        "elapsed_ms": round(elapsed_ms),
        "running_ms": round(running_ms),
        "stopped_ms": round(stopped_ms),
        "stopped_externo_ms": round(stopped_externo_ms),
        "pausa_ms": round(pausa_ms),
        "num_paradas": num_paradas,
        "num_paradas_internas": num_paradas_internas,
        "num_paradas_externas": num_paradas_externas,
        "ultimo_estado": ultimo_estado,
        "producao": producao,
        "refugo": refugo,
        "disponibilidade": round(disponibilidade, 1),
        "performance": round(performance, 1),
        "qualidade": round(qualidade, 1),
        "oee": round(oee, 1),
        "eficiencia": round(disponibilidade, 1),
        "mtbf_ms": round(mtbf_ms) if mtbf_ms is not None else None,
        "mttr_ms": round(mttr_ms) if mttr_ms is not None else None,
    }


def calcular_paradas_por_motivo(eventos: list, timestamp_fim: Optional[datetime]) -> list:
    """
    Agrupa paradas por motivo com duração, percentual e categoria.
    Retorna lista de dicts: motivo, categoria, count, total_ms, percentual
    """
    agora = datetime.now()
    fim = timestamp_fim or agora

    by_motivo = {}
    for i, ev in enumerate(eventos):
        if ev.tipo != "parada":
            continue
        motivo = ev.motivo or "Não informado"
        categoria = ev.categoria or "Interna"
        prox_marcha = next(
            (e for j, e in enumerate(eventos) if j > i and e.tipo == "marcha"),
            None
        )
        end = prox_marcha.timestamp if prox_marcha else fim
        duration_ms = (end - ev.timestamp).total_seconds() * 1000

        key = motivo
        if key not in by_motivo:
            by_motivo[key] = {"count": 0, "total_ms": 0.0, "categoria": categoria}
        by_motivo[key]["count"] += 1
        by_motivo[key]["total_ms"] += duration_ms

    total_ms = sum(v["total_ms"] for v in by_motivo.values())

    return [
        {
            "motivo": motivo,
            "categoria": data["categoria"],
            "count": data["count"],
            "total_ms": round(data["total_ms"]),
            "percentual": round((data["total_ms"] / total_ms * 100), 1) if total_ms > 0 else 0,
        }
        for motivo, data in sorted(by_motivo.items(), key=lambda x: -x[1]["total_ms"])
    ]


# ============================================================
# CÁLCULOS SEMI-AUTOMÁTICO — WISE-4051
# ============================================================

def calcular_delta_counter(
    valor_atual: float,
    valor_anterior: float,
) -> Optional[float]:
    """
    Calcula o delta de um canal Counter entre dois polls.
    Retorna None se delta negativo (reset ou overflow).
    """
    delta = valor_atual - valor_anterior
    if delta < 0:
        return None
    return delta


def aplicar_formula(
    operacoes: list[dict],
    deltas_por_posicao: dict[str, float],
) -> Optional[float]:
    """
    Aplica uma fórmula de cálculo usando os deltas dos counters.
    Retorna None se alguma posição estiver ausente.
    """
    resultado = 0.0
    for op in operacoes:
        posicao = op.get("posicao")
        operacao = op.get("operacao", "+")
        delta = deltas_por_posicao.get(posicao)
        if delta is None:
            return None
        if operacao == "+":
            resultado += delta
        elif operacao == "-":
            resultado -= delta
    return max(0.0, resultado)


def detectar_estado_di(
    leituras_recentes: list[dict],
    tempo_sem_alteracao_segundos: int,
    agora: Optional[datetime] = None,
) -> Optional[str]:
    """
    Detecta estado da máquina por canal DI.
    Sinal estático por tempo_sem_alteracao_segundos → parada.
    Retorna "rodando", "parado" ou None.
    """
    if not leituras_recentes:
        return None

    agora = agora or datetime.now()
    threshold = timedelta(seconds=tempo_sem_alteracao_segundos)

    ultima_alteracao = None
    valor_ref = leituras_recentes[-1]["valor"]

    for leitura in reversed(leituras_recentes):
        if leitura["valor"] != valor_ref:
            ultima_alteracao = leitura["timestamp"]
            break

    if ultima_alteracao is None:
        ultima_alteracao = leituras_recentes[0]["timestamp"]

    tempo_estatico = agora - ultima_alteracao

    if tempo_estatico >= threshold:
        return "parado"
    return "rodando"