# ============================================================
# LAUNCHER.PY — Inicializador do SmartLine
# Roda backend (uvicorn) e frontend (HTTP server) em threads.
# ============================================================

import sys
import os
import time
import threading
import webbrowser
from pathlib import Path
from multiprocessing import freeze_support
freeze_support()

# Resolve o diretório base
if getattr(sys, 'frozen', False):
    BASE_DIR = Path(sys.executable).parent
else:
    BASE_DIR = Path(__file__).parent

sys.path.insert(0, str(BASE_DIR))
os.chdir(str(BASE_DIR))

BACKEND_PORT = 5000
FRONTEND_PORT = 5500


def iniciar_backend():
    """Inicia o uvicorn diretamente."""
    import uvicorn
    uvicorn.run(
        'backend.main:app',
        host='0.0.0.0',
        port=BACKEND_PORT,
        log_level='info',
    )


def iniciar_frontend():
    """Inicia servidor HTTP para o frontend."""
    import http.server

    # Quando frozen, os arquivos ficam em _MEIXXXXXX (temp)
    # mas o frontend deve ser servido da pasta ao lado do .exe
    if getattr(sys, 'frozen', False):
        frontend_dir = str(Path(sys.executable).parent / 'frontend')
    else:
        frontend_dir = str(BASE_DIR / 'frontend')

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=frontend_dir, **kwargs)

        def log_message(self, format, *args):
            pass

    server = http.server.HTTPServer(('0.0.0.0', FRONTEND_PORT), Handler)
    server.serve_forever()


def aguardar_backend(timeout=20):
    """Aguarda o backend responder."""
    import urllib.request
    inicio = time.time()
    while time.time() - inicio < timeout:
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{BACKEND_PORT}/', timeout=1)
            return True
        except Exception:
            time.sleep(0.5)
    return False


if __name__ == '__main__':
    print('=' * 48)
    print('  SmartLine — Auditoria de Linha de Producao')
    print('=' * 48)
    print(f'  Backend:  http://127.0.0.1:{BACKEND_PORT}')
    print(f'  Frontend: http://127.0.0.1:{FRONTEND_PORT}')
    print('=' * 48)
    print()

    t_frontend = threading.Thread(target=iniciar_frontend, daemon=True)
    t_backend = threading.Thread(target=iniciar_backend, daemon=True)

    t_frontend.start()
    t_backend.start()

    print('Aguardando backend iniciar...')
    if aguardar_backend():
        print('Backend pronto!')
    else:
        print('Timeout — abrindo browser mesmo assim...')

    time.sleep(1)
    print(f'\nAbrindo http://127.0.0.1:{FRONTEND_PORT} no browser...')
    webbrowser.open(f'http://127.0.0.1:{FRONTEND_PORT}')

    print('\nSmartLine rodando. Feche esta janela para encerrar.\n')

    try:
        t_backend.join()
    except KeyboardInterrupt:
        print('\nEncerrando...')
        sys.exit(0)