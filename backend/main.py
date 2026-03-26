from fastapi import FastAPI
from backend.routes.medicoes import router as medicoes_router
from backend.routes.eventos import router as eventos_router

app = FastAPI()

app.include_router(medicoes_router)
app.include_router(eventos_router)

@app.get("/")
def root():
    return {"status": "ok", "message": "Servidor SmartLine rodando"}