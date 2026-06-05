import os
import sys
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.evento import Evento
from backend.models.medicao import Medicao
from backend.schemas.evento import EventoCreate, EventoResponse, EventoCategoriaUpdate

router = APIRouter(prefix="/medicoes/{medicao_id}/eventos", tags=["eventos"])

# Resolve o diretório base para salvar as fotos
if getattr(sys, 'frozen', False):
    BASE_DIR = Path(sys.executable).parent
else:
    BASE_DIR = Path(__file__).parent.parent.parent

FOTOS_DIR = BASE_DIR / "fotos"
FOTOS_DIR.mkdir(exist_ok=True)

# Tipos de evento válidos
TIPOS_VALIDOS = {"marcha", "parada", "producao", "pausa", "retomada"}

# Categorias válidas para paradas
CATEGORIAS_VALIDAS = {"Interna", "Externa"}


# Registra um novo evento na medição.
@router.post("/", response_model=EventoResponse)
def registrar_evento(medicao_id: int, dados: EventoCreate, db: Session = Depends(get_db)):
    medicao = db.query(Medicao).filter(Medicao.id == medicao_id).first()
    if not medicao:
        raise HTTPException(status_code=404, detail="Medição não encontrada")
    if medicao.timestamp_fim:
        raise HTTPException(status_code=400, detail="Medição já finalizada")
    if dados.tipo not in TIPOS_VALIDOS:
        raise HTTPException(status_code=422, detail=f"Tipo deve ser um de: {', '.join(TIPOS_VALIDOS)}")

    # Valida categoria se informada
    if dados.categoria and dados.categoria not in CATEGORIAS_VALIDAS:
        raise HTTPException(status_code=422, detail=f"Categoria deve ser 'Interna' ou 'Externa'")

    evento = Evento(medicao_id=medicao_id, **dados.model_dump())
    db.add(evento)
    db.commit()
    db.refresh(evento)
    return evento


# Retorna todos os eventos de uma medição em ordem cronológica.
@router.get("/", response_model=list[EventoResponse])
def listar_eventos(medicao_id: int, db: Session = Depends(get_db)):
    medicao = db.query(Medicao).filter(Medicao.id == medicao_id).first()
    if not medicao:
        raise HTTPException(status_code=404, detail="Medição não encontrada")
    return db.query(Evento).filter(Evento.medicao_id == medicao_id).order_by(Evento.timestamp).all()


# Atualiza o motivo de um evento de parada específico.
@router.patch("/{evento_id}/motivo", response_model=EventoResponse)
def atualizar_motivo(medicao_id: int, evento_id: int, motivo: str, db: Session = Depends(get_db)):
    evento = db.query(Evento).filter(
        Evento.id == evento_id,
        Evento.medicao_id == medicao_id
    ).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado")
    evento.motivo = motivo
    db.commit()
    db.refresh(evento)
    return evento


# Atualiza a categoria de um evento de parada (Interna ou Externa).
# Usado pelo auditor/admin para corrigir a classificação de uma parada.
@router.patch("/{evento_id}/categoria", response_model=EventoResponse)
def atualizar_categoria(
    medicao_id: int,
    evento_id: int,
    dados: EventoCategoriaUpdate,
    db: Session = Depends(get_db)
):
    if dados.categoria not in CATEGORIAS_VALIDAS:
        raise HTTPException(status_code=422, detail="Categoria deve ser 'Interna' ou 'Externa'")

    evento = db.query(Evento).filter(
        Evento.id == evento_id,
        Evento.medicao_id == medicao_id
    ).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado")
    if evento.tipo != "parada":
        raise HTTPException(status_code=422, detail="Apenas eventos de parada têm categoria")

    evento.categoria = dados.categoria
    db.commit()
    db.refresh(evento)
    return evento


# Recebe uma imagem, corrige orientação EXIF, comprime para PNG e salva em fotos/.
@router.post("/{evento_id}/foto", response_model=EventoResponse)
async def upload_foto(
    medicao_id: int,
    evento_id: int,
    foto: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    try:
        from PIL import Image, ExifTags
        import io
    except ImportError:
        raise HTTPException(status_code=500, detail="Pillow não instalado. Execute: pip install Pillow")

    evento = db.query(Evento).filter(
        Evento.id == evento_id,
        Evento.medicao_id == medicao_id
    ).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado")

    conteudo = await foto.read()
    img = Image.open(io.BytesIO(conteudo))

    try:
        exif = img._getexif()
        if exif:
            for tag, value in exif.items():
                if ExifTags.TAGS.get(tag) == 'Orientation':
                    if value == 3:
                        img = img.rotate(180, expand=True)
                    elif value == 6:
                        img = img.rotate(270, expand=True)
                    elif value == 8:
                        img = img.rotate(90, expand=True)
                    break
    except Exception:
        pass

    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    max_size = 1280
    if img.width > max_size or img.height > max_size:
        img.thumbnail((max_size, max_size), Image.LANCZOS)

    nome_arquivo = f"ev_{evento_id}med{medicao_id}.png"
    caminho = FOTOS_DIR / nome_arquivo

    buffer = io.BytesIO()
    img.save(buffer, format="PNG", optimize=True, compress_level=6)
    with open(caminho, "wb") as f:
        f.write(buffer.getvalue())

    evento.foto_path = f"fotos/{nome_arquivo}"
    db.commit()
    db.refresh(evento)
    return evento


# Retorna a foto de um evento pelo caminho salvo.
@router.get("/{evento_id}/foto")
def get_foto(medicao_id: int, evento_id: int, db: Session = Depends(get_db)):
    evento = db.query(Evento).filter(
        Evento.id == evento_id,
        Evento.medicao_id == medicao_id
    ).first()
    if not evento or not evento.foto_path:
        raise HTTPException(status_code=404, detail="Foto não encontrada")

    caminho = BASE_DIR / evento.foto_path
    if not caminho.exists():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")

    return FileResponse(str(caminho), media_type="image/png")