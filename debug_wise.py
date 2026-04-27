import sqlite3
conn = sqlite3.connect('smartline.db')

print('=== wise_raw ===')
rows = conn.execute('SELECT channel_id, valor, timestamp FROM wise_raw ORDER BY timestamp DESC LIMIT 10').fetchall()
print(f'Total: {len(rows)}')
for r in rows:
    print(r)

print()
print('=== medicoes semi-auto ativas ===')
rows2 = conn.execute(
    "SELECT id, tipo, timestamp_inicio FROM medicoes WHERE tipo='semiautomatico' AND timestamp_fim IS NULL"
).fetchall()
for r in rows2:
    print(r)

print()
print('=== eventos da medicao ativa ===')
rows3 = conn.execute("""
    SELECT tipo, timestamp, motivo FROM eventos
    WHERE medicao_id = (
        SELECT id FROM medicoes WHERE tipo='semiautomatico' AND timestamp_fim IS NULL ORDER BY id DESC LIMIT 1
    )
    ORDER BY timestamp DESC LIMIT 10
""").fetchall()
for r in rows3:
    print(r)

conn.close()