from backend.database import SessionLocal
from backend.models.usuario import Usuario
from backend.auth import hash_senha
import urllib.request
import urllib.parse
import json

db = SessionLocal()
test_user = db.query(Usuario).filter(Usuario.login == "test_admin").first()
if not test_user:
    test_user = Usuario(nome="Test Admin", login="test_admin", senha_hash=hash_senha("123"), nivel="admin")
    db.add(test_user)
    db.commit()
    db.refresh(test_user)

req = urllib.request.Request(
    "http://127.0.0.1:5000/auth/login",
    data=json.dumps({"login": "test_admin", "senha": "123"}).encode('utf-8'),
    headers={"Content-Type": "application/json"}
)
with urllib.request.urlopen(req) as resp:
    print("Login status:", resp.status)
    data = json.loads(resp.read().decode('utf-8'))
    token = data.get("token")

req3 = urllib.request.Request(
    "http://127.0.0.1:5000/auth/usuarios",
    headers={"Authorization": f"Bearer {token}"}
)
try:
    with urllib.request.urlopen(req3) as resp:
        print("Auth/usuarios status:", resp.status)
except urllib.error.HTTPError as e:
    print("GET /auth/usuarios HTTPError:", e.code)
    print("Error body:", e.read().decode())

db.delete(test_user)
db.commit()
db.close()
