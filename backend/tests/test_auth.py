import urllib.request
import urllib.parse
import json
import sys

def attempt_login(login, pw):
    req = urllib.request.Request(
        "http://127.0.0.1:5000/auth/login",
        data=json.dumps({"login": login, "senha": pw}).encode('utf-8'),
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data.get("token")
    except urllib.error.HTTPError as e:
        print(f"Login failed for {login}:", e.code, e.read().decode())
        return None

token = attempt_login("manoel.rodrigues", "123")
if not token:
    token = attempt_login("admin", "123")

if not token:
    print("Could not get a token!")
    sys.exit(1)

# 2. Get users
req3 = urllib.request.Request(
    "http://127.0.0.1:5000/auth/usuarios",
    headers={"Authorization": f"Bearer {token}"}
)
try:
    with urllib.request.urlopen(req3) as resp:
        print("GET /auth/usuarios status:", resp.status)
        print("Response:", resp.read().decode('utf-8')[:100])
except urllib.error.HTTPError as e:
    print("GET /auth/usuarios HTTPError:", e.code)
    print("Error body:", e.read().decode())
