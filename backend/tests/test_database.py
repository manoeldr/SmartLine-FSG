import pytest
from sqlalchemy import text
from backend.database import engine, SessionLocal, Base

def test_engine_cria_conexao():
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1"))
        assert result.fetchone()[0] == 1

def test_session_abre_e_fecha():
    db = SessionLocal()
    try:
        result = db.execute(text("SELECT 1"))
        assert result.fetchone()[0] == 1
    finally:
        db.close()

def test_base_tem_metadata():
    assert Base.metadata is not None