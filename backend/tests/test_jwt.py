import jwt
from datetime import datetime

SECRET_KEY = "smartline-secret-key-stable"
ALGORITHM = "HS256"

payload = {
    "sub": "123",
    "nivel": "admin",
    "iat": datetime.utcnow().timestamp(),
}
token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
print("Token encoded:", token, type(token))

try:
    decoded = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    print("Decoded:")
    print(decoded)
except Exception as e:
    print("Decode failed:", type(e), str(e))
