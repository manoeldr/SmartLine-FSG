# ============================================================
# CALCULATIONS.PY — Cálculos de indicadores de produção
# Fonte única de verdade para OEE, MTBF, MTTR, disponibilidade,
# performance e eficiência. Usado por routes e endpoints.
# Inclui também os cálculos específicos da medição semi-automática
# via WISE-4051: delta de counter, detecção de parada por DI.
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

    # Lista de intervalos de funcionamento entre paradas consecutivas
    # Usado para cálculo preciso do MTBF
    # Formato: [(inicio_funcionamento, fim_funcionamento), ...]
    intervalos_funcionamento = []
    ultimo_fim_parada = None  # momento em que a última parada terminou (marcha)

    for ev in eventos:
        if ev.tipo == "parada":
            if ultimo_fim_parada is not None:
                # Registra o intervalo de funcionamento desde a última marcha até esta parada
                intervalos_funcionamento.append(
                    (ev.timestamp - ultimo_fim_parada).total_seconds() * 1000
                )
            stop_time = ev.timestamp
            num_paradas += 1
            ultimo_estado = "parado"

        elif ev.tipo == "marcha" and stop_time:
            stopped_ms += (ev.timestamp - stop_time).total_seconds() * 1000
            ultimo_fim_parada = ev.timestamp
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
    # Limitada a 100% — sobrevelocidade não infla o indicador
    running_horas = running_ms / 3_600_000
    producao_esperada = running_horas * (velocidade_nominal or 1)
    performance = (
        min((producao / producao_esperada) * 100, 100)
        if producao_esperada > 0
        else 0.0
    )

    # ── OEE ──────────────────────────────────────────────────
    # Disponibilidade × Performance × Qualidade
    # Qualidade = 100% por enquanto (refugo não implementado)
    oee = (disponibilidade / 100) * (performance / 100) * 100

    # ── MTBF ─────────────────────────────────────────────────
    # Tempo médio de funcionamento entre falhas.
    # Calculado como a média dos intervalos de funcionamento
    # entre paradas consecutivas — requer ao menos 2 paradas.
    # Com menos de 2 paradas retorna None.
    if len(intervalos_funcionamento) >= 1:
        mtbf_ms = sum(intervalos_funcionamento) / len(intervalos_funcionamento)
    else:
        mtbf_ms = None

    # ── MTTR ─────────────────────────────────────────────────
    # Tempo médio de reparo (tempo parado total / nº paradas)
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


# ============================================================
# CÁLCULOS SEMI-AUTOMÁTICO — WISE-4051
# ============================================================

def calcular_delta_counter(
    valor_atual: float,
    valor_anterior: float,
) -> Optional[float]:
    """
    Calcula o delta de um canal Counter entre dois polls.

    Se o delta for negativo (reset ou overflow do contador no WISE),
    retorna None para indicar que este intervalo deve ser ignorado.

    Parâmetros:
        valor_atual: valor acumulado lido no poll atual
        valor_anterior: valor acumulado lido no poll anterior

    Retorna o delta positivo ou None se inválido.
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
    Aplica uma fórmula de cálculo (produção ou refugo) usando os deltas
    dos counters de cada posição configurada.

    Parâmetros:
        operacoes: lista de dicts com "posicao" e "operacao" (+ ou -)
                   Ex: [{"posicao": "saida", "operacao": "+"}, {"posicao": "inspetor", "operacao": "-"}]
        deltas_por_posicao: dict com o delta calculado para cada posição
                   Ex: {"saida": 1500.0, "inspetor": 45.0}

    Retorna o resultado da fórmula ou None se alguma posição estiver ausente.
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
    return max(0.0, resultado)  # produção nunca negativa


def detectar_estado_di(
    leituras_recentes: list[dict],
    tempo_sem_alteracao_segundos: int,
    agora: Optional[datetime] = None,
) -> Optional[str]:
    """
    Detecta o estado da máquina com base nas leituras recentes de um canal DI.

    O canal DI é um sensor de passagem de produto — alterna entre 0 e 1
    conforme produtos passam. Se o sinal ficar estático (sem alternar)
    por tempo_sem_alteracao_segundos, considera parada.

    Parâmetros:
        leituras_recentes: lista de dicts com "valor" e "timestamp" (datetime),
                           ordenados cronologicamente (mais antigo primeiro)
        tempo_sem_alteracao_segundos: threshold de tempo sem alteração para parada
        agora: datetime atual (None = datetime.now())

    Retorna:
        "rodando"  — sinal alternando normalmente
        "parado"   — sinal estático por mais de tempo_sem_alteracao_segundos
        None       — sem leituras suficientes para determinar
    """
    if not leituras_recentes:
        return None

    agora = agora or datetime.now()
    threshold = timedelta(seconds=tempo_sem_alteracao_segundos)

    # Percorre as leituras de trás para frente procurando a última alteração
    ultima_alteracao = None
    valor_ref = leituras_recentes[-1]["valor"]

    for leitura in reversed(leituras_recentes):
        if leitura["valor"] != valor_ref:
            ultima_alteracao = leitura["timestamp"]
            break

    # Se nunca alterou, usa o timestamp da primeira leitura disponível
    if ultima_alteracao is None:
        ultima_alteracao = leituras_recentes[0]["timestamp"]

    tempo_estatico = agora - ultima_alteracao

    if tempo_estatico >= threshold:
        return "parado"
    return "rodando"