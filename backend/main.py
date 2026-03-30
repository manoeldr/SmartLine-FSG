from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.database import engine, Base
from backend.routes.medicoes import router as medicoes_router
from backend.routes.eventos import router as eventos_router
import backend.models.medicao
import backend.models.evento

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(medicoes_router)
app.include_router(eventos_router)

@app.get("/")
def root():
    return {"status": "ok", "message": "Servidor SmartLine rodando"}