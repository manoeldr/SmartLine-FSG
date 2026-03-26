from fastapi import FastAPI
from backend.routes.medicoes import router as medicoes_router

app = FastAPI()

app.include_router(medicoes_router)

@app.get("/")
def root():
    return {"status": "ok", "message": "Servidor SmartLine rodando"}