from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from backend.database import engine, Base

# Models — devem ser importados antes das routes para o SQLAlchemy e Pydantic
# resolverem todos os tipos corretamente
import backend.models.medicao
import backend.models.evento
import backend.models.cliente
import backend.models.linha
import backend.models.maquina_linha
import backend.models.usuario
import backend.models.semiauto.wise_device
import backend.models.semiauto.wise_channel
import backend.models.semiauto.wise_formula
import backend.models.semiauto.wise_raw

# Routes — importadas após os models
from backend.routes.medicoes import router as medicoes_router
from backend.routes.eventos import router as eventos_router
from backend.routes.clientes import router as clientes_router
from backend.routes.linhas import router as linhas_router
from backend.routes.maquinas_linha import router as maquinas_router
from backend.routes.auth import router as auth_router
from backend.routes.semiauto.wise_devices import router as wise_devices_router
from backend.routes.semiauto.wise_channels import router as wise_channels_router
from backend.routes.semiauto.wise_formulas import router as wise_formulas_router

Base.metadata.create_all(bind=engine)

# ============================================================
# MIGRAÇÕES — compatibilidade sem Alembic
# Adiciona colunas novas em tabelas existentes sem recriar o banco
# ============================================================

inspector = inspect(engine)

# Migração: multiplicador_produto em maquinas_linha
if 'maquinas_linha' in inspector.get_table_names():
    col_names = [c['name'] for c in inspector.get_columns('maquinas_linha')]
    if 'multiplicador_produto' not in col_names:
        with engine.connect() as conn:
            try:
                conn.execute(text('ALTER TABLE maquinas_linha ADD COLUMN multiplicador_produto FLOAT DEFAULT 1'))
                conn.commit()
            except Exception:
                pass

# Migração: sobrevelocidade em maquinas_linha
if 'maquinas_linha' in inspector.get_table_names():
    col_names = [c['name'] for c in inspector.get_columns('maquinas_linha')]
    if 'sobrevelocidade' not in col_names:
        with engine.connect() as conn:
            try:
                conn.execute(text('ALTER TABLE maquinas_linha ADD COLUMN sobrevelocidade FLOAT'))
                conn.commit()
            except Exception:
                pass

# Migração: usuario_nome em medicoes
if 'medicoes' in inspector.get_table_names():
    col_names = [c['name'] for c in inspector.get_columns('medicoes')]
    if 'usuario_nome' not in col_names:
        with engine.connect() as conn:
            try:
                conn.execute(text('ALTER TABLE medicoes ADD COLUMN usuario_nome VARCHAR'))
                conn.commit()
            except Exception:
                pass

# Migração: usuario e senha em wise_devices
if 'wise_devices' in inspector.get_table_names():
    col_names = [c['name'] for c in inspector.get_columns('wise_devices')]
    if 'usuario' not in col_names:
        with engine.connect() as conn:
            try:
                conn.execute(text("ALTER TABLE wise_devices ADD COLUMN usuario VARCHAR DEFAULT 'root'"))
                conn.commit()
            except Exception:
                pass
    if 'senha' not in col_names:
        with engine.connect() as conn:
            try:
                conn.execute(text('ALTER TABLE wise_devices ADD COLUMN senha VARCHAR'))
                conn.commit()
            except Exception:
                pass

# Migração: tempo_sem_alteracao_segundos em wise_channels
if 'wise_channels' in inspector.get_table_names():
    col_names = [c['name'] for c in inspector.get_columns('wise_channels')]
    if 'tempo_sem_alteracao_segundos' not in col_names:
        with engine.connect() as conn:
            try:
                conn.execute(text('ALTER TABLE wise_channels ADD COLUMN tempo_sem_alteracao_segundos INTEGER DEFAULT 30'))
                conn.commit()
            except Exception:
                pass

# Migração: tipo em medicoes
if 'medicoes' in inspector.get_table_names():
    col_names = [c['name'] for c in inspector.get_columns('medicoes')]
    if 'tipo' not in col_names:
        with engine.connect() as conn:
            try:
                conn.execute(text("ALTER TABLE medicoes ADD COLUMN tipo VARCHAR DEFAULT 'manual'"))
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

app.include_router(auth_router)
app.include_router(medicoes_router)
app.include_router(eventos_router)
app.include_router(clientes_router)
app.include_router(linhas_router)
app.include_router(maquinas_router)
app.include_router(wise_devices_router)
app.include_router(wise_channels_router)
app.include_router(wise_formulas_router)

@app.get("/")
def root():
    return {"status": "ok", "message": "Servidor SmartLine rodando"}