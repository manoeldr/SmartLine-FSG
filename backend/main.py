from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from backend.database import engine, Base
from backend.routes.medicoes import router as medicoes_router
from backend.routes.eventos import router as eventos_router
from backend.routes.clientes import router as clientes_router
from backend.routes.linhas import router as linhas_router
from backend.routes.maquinas_linha import router as maquinas_router
import backend.models.medicao
import backend.models.evento
import backend.models.cliente
import backend.models.linha
import backend.models.maquina_linha

Base.metadata.create_all(bind=engine)

# Migrar coluna 'multiplicador_produto' (compatibilidade sem Alembic)
inspector = inspect(engine)
if 'maquinas_linha' in inspector.get_table_names():
    col_names = [c['name'] for c in inspector.get_columns('maquinas_linha')]
    if 'multiplicador_produto' not in col_names:
        with engine.connect() as conn:
            try:
                conn.execute(text('ALTER TABLE maquinas_linha ADD COLUMN multiplicador_produto FLOAT DEFAULT 1'))
                conn.commit()
            except Exception:
                pass

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(medicoes_router)
app.include_router(eventos_router)
app.include_router(clientes_router)
app.include_router(linhas_router)
app.include_router(maquinas_router)

@app.get("/")
def root():
    return {"status": "ok", "message": "Servidor SmartLine rodando"}