# ============================================================
# LAUNCHER.PY — Inicializador do SmartLine
# Sobe quatro serviços em threads separadas:
#   1. Backend FastAPI via uvicorn (porta 5000)
#   2. Frontend via HTTP server simples (porta 5500)
#   3. Worker de polling do WISE — lê os sensores e grava wise_raw
#   4. Worker de tratamento — processa wise_raw e gera eventos/produção
# Ao final, abre o browser automaticamente no frontend.
# ============================================================

import sys
import os
import time
import threading
import webbrowser
from pathlib import Path
from multiprocessing import freeze_support

# Necessário para compatibilidade com PyInstaller no Windows
# Evita que processos filhos sejam criados recursivamente ao congelar
freeze_support()

# ── Resolve o diretório base ─────────────────────────────────
# Quando executado como .exe (frozen), o BASE_DIR é a pasta do executável.
# Quando executado como script Python, é a pasta do próprio arquivo.
if getattr(sys, 'frozen', False):
    BASE_DIR = Path(sys.executable).parent
else:
    BASE_DIR = Path(__file__).parent

# Garante que os imports do backend funcionem corretamente
sys.path.insert(0, str(BASE_DIR))
os.chdir(str(BASE_DIR))

BACKEND_PORT = 5000
FRONTEND_PORT = 5500


# ============================================================
# THREAD 1 — BACKEND
# ============================================================

def iniciar_backend():
    """
    Inicia o servidor FastAPI via uvicorn.
    Escuta em todas as interfaces (0.0.0.0) para permitir
    acesso tanto local quanto de outros dispositivos na rede.
    """
    import uvicorn
    uvicorn.run(
        'backend.main:app',
        host='0.0.0.0',
        port=BACKEND_PORT,
        log_level='info',
    )


# ============================================================
# THREAD 2 — FRONTEND
# ============================================================

def iniciar_frontend():
    """
    Inicia um servidor HTTP simples para servir os arquivos estáticos
    do frontend (HTML, CSS, JS).
    Quando frozen (executável), serve da pasta frontend/ ao lado do .exe.
    Quando em desenvolvimento, serve da pasta frontend/ do projeto.
    Logs de acesso são suprimidos para não poluir o console.
    """
    import http.server

    if getattr(sys, 'frozen', False):
        frontend_dir = str(Path(sys.executable).parent / 'frontend')
    else:
        frontend_dir = str(BASE_DIR / 'frontend')

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=frontend_dir, **kwargs)

        def log_message(self, format, *args):
            # Suprime logs de cada requisição HTTP do frontend
            pass

    server = http.server.HTTPServer(('0.0.0.0', FRONTEND_PORT), Handler)
    server.serve_forever()


# ============================================================
# THREAD 3 — WISE WORKER (polling)
# ============================================================

def iniciar_wise_worker():
    """
    Inicia o worker de polling dos dispositivos WISE-4051.
    Lê os sensores a cada 5 segundos e grava os dados brutos em wise_raw.
    Aguarda o backend estar pronto antes de iniciar para garantir
    que o banco de dados já foi inicializado e todas as migrações
    foram aplicadas pelo main.py.
    """
    from backend.semiauto.wise_worker import iniciar_worker
    aguardar_backend()
    iniciar_worker()


# ============================================================
# THREAD 4 — WISE PROCESSOR (tratamento)
# ============================================================

def iniciar_wise_processor():
    """
    Inicia o worker de tratamento dos dados brutos do WISE.
    Processa wise_raw a cada 10 segundos:
        - Detecta paradas/marchas via canais DI
        - Calcula produção por slot horário via counters e fórmulas
        - Grava eventos nas medições semi-automáticas ativas
    Aguarda o backend estar pronto antes de iniciar.
    """
    from backend.semiauto.wise_processor import iniciar_processor
    aguardar_backend()
    iniciar_processor()


# ============================================================
# UTILITÁRIO — AGUARDAR BACKEND
# ============================================================

def aguardar_backend(timeout=20):
    """
    Tenta conectar ao backend em loop até ele responder ou o timeout expirar.
    Retorna True se o backend respondeu, False se esgotou o tempo.
    Usado tanto pelo launcher (para abrir o browser) quanto pelos workers
    (para garantir que o banco está pronto antes de iniciar o polling).
    """
    import urllib.request
    inicio = time.time()
    while time.time() - inicio < timeout:
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{BACKEND_PORT}/', timeout=1)
            return True
        except Exception:
            time.sleep(0.5)
    return False


# ============================================================
# PONTO DE ENTRADA
# ============================================================

if __name__ == '__main__':
    print('=' * 48)
    print('  SmartLine — Auditoria de Linha de Producao')
    print('=' * 48)
    print(f'  Backend:  http://127.0.0.1:{BACKEND_PORT}')
    print(f'  Frontend: http://127.0.0.1:{FRONTEND_PORT}')
    print('=' * 48)
    print()

    # Inicia as quatro threads como daemon para encerrarem junto com o processo
    t_frontend  = threading.Thread(target=iniciar_frontend,       daemon=True)
    t_backend   = threading.Thread(target=iniciar_backend,        daemon=True)
    t_worker    = threading.Thread(target=iniciar_wise_worker,    daemon=True)
    t_processor = threading.Thread(target=iniciar_wise_processor, daemon=True)

    t_frontend.start()
    t_backend.start()
    t_worker.start()
    t_processor.start()

    # Aguarda o backend estar pronto antes de abrir o browser
    print('Aguardando backend iniciar...')
    if aguardar_backend():
        print('Backend pronto!')
    else:
        print('Timeout — abrindo browser mesmo assim...')

    # Pequena pausa extra para garantir que o frontend também subiu
    time.sleep(1)
    print(f'\nAbrindo http://127.0.0.1:{FRONTEND_PORT} no browser...')
    webbrowser.open(f'http://127.0.0.1:{FRONTEND_PORT}')

    print('\nSmartLine rodando. Feche esta janela para encerrar.\n')

    # Mantém o processo principal vivo aguardando o backend
    # Ctrl+C encerra tudo graciosamente
    try:
        t_backend.join()
    except KeyboardInterrupt:
        print('\nEncerrando...')
        sys.exit(0)