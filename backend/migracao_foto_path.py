# Adiciona no backend/main.py junto com as outras migrações:

# Migração: foto_path em eventos
if 'eventos' in inspector.get_table_names():
    col_names = [c['name'] for c in inspector.get_columns('eventos')]
    if 'foto_path' not in col_names:
        with engine.connect() as conn:
            try:
                conn.execute(text('ALTER TABLE eventos ADD COLUMN foto_path VARCHAR(500)'))
                conn.commit()
            except Exception:
                pass