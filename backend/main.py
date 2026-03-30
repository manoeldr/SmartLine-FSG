from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5500"],
    allow_credentials=True,
    allow_methods=["*"],
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