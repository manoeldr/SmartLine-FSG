# SmartLine — Sistema de Monitoramento de Linha de Produção

SmartLine é uma plataforma de auditoria e monitoramento de linhas de produção industrial, desenvolvida como projeto extensionista da disciplina de Fundamentos da Computação da FSG (Faculdade da Serra Gaúcha) e implantada em ambiente produtivo real.

O sistema permite que auditores registrem eventos de produção em tempo real — marchas, paradas, pausas programadas e leituras periódicas — calculando automaticamente indicadores de eficiência como OEE, MTBF, MTTR, disponibilidade e performance.

---

## Funcionalidades

- **Medição manual** — auditor registra marcha/parada pelo celular ou computador
- **Medição semi-automática** — integração com dispositivos WISE-4051 (sensores IoT) para detecção automática de marcha/parada e contagem de produção
- **Pausa programada** — pausa o timer da medição sem impactar os indicadores de disponibilidade
- **Refugo** — apontamento de refugo por máquina com impacto no indicador de qualidade do OEE
- **Categoria de parada** — classifica paradas como Interna (penaliza OEE) ou Externa (registrada mas não penaliza)
- **OEE completo** — Disponibilidade × Performance × Qualidade com separação de paradas internas e externas
- **MTBF e MTTR** — calculados a partir dos intervalos reais de funcionamento entre paradas
- **Fluxo da linha** — visualização em tempo real do estado de cada máquina na linha
- **Timeline de eventos** — histórico detalhado de cada medição com edição de categoria inline
- **Gestão de usuários** — níveis de acesso: admin, auditor e cliente
- **Exportação JSON** — dados completos da medição disponíveis para exportação
- **Multi-linha e multi-cliente** — suporte a múltiplos clientes, linhas e máquinas

---

## Stack

**Backend**
- Python 3.13+
- FastAPI
- SQLAlchemy
- SQLite (WAL mode)
- PyJWT + bcrypt
- Pillow (compressão de fotos)
- httpx (comunicação com dispositivos WISE)

**Frontend**
- HTML, CSS e JavaScript puro (sem frameworks)
- Chart.js (gráficos de produção e OEE)

**Distribuição**
- PyInstaller (.exe para Windows)
- Servidor HTTP embutido para o frontend

---

## Instalação e uso

### Pré-requisitos

- Python 3.13 ou superior
- Git

### 1. Clonar o repositório

```bash
git clone https://github.com/manoeldr/SmartLine-FSG.git
cd SmartLine-FSG
```

### 2. Criar o ambiente virtual

```bash
python -m venv venv
```

**Windows (PowerShell):**
```powershell
.\venv\Scripts\activate
```

**Linux/Mac:**
```bash
source venv/bin/activate
```

### 3. Instalar dependências

```bash
pip install -r requirements.txt
```

### 4. Iniciar o servidor

**Windows:**
```powershell
.\start.bat
```

**Manual (qualquer SO):**
```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 5000 --reload
```

O frontend estará disponível em `http://localhost:5500` e o backend em `http://localhost:5000`.

### 5. Criar o usuário administrador

Com o servidor rodando, execute em outro terminal:

```bash
python -c "import bcrypt, sqlite3; senha = bcrypt.hashpw(b'admin123', bcrypt.gensalt()).decode(); conn = sqlite3.connect('smartline.db'); conn.execute('INSERT INTO usuarios (nome, login, senha_hash, nivel) VALUES (?,?,?,?)', ('Admin', 'admin', senha, 'admin')); conn.commit(); conn.close(); print('Admin criado!')"
```

Acesse o sistema com:
- **Usuário:** `admin`
- **Senha:** `admin123`

> Recomendado alterar a senha após o primeiro acesso.

---

## Estrutura do projeto

```
SmartLine/
├── backend/
│   ├── main.py              # Entrada do FastAPI + migrações inline
│   ├── database.py          # Configuração do SQLAlchemy
│   ├── calculations.py      # Cálculos de OEE, MTBF, MTTR, disponibilidade
│   ├── models/              # Models SQLAlchemy
│   ├── schemas/             # Schemas Pydantic
│   ├── routes/              # Endpoints da API
│   └── semiauto/            # Workers WISE (polling + processamento)
├── frontend/
│   ├── index.html           # SPA principal
│   ├── pages/               # Páginas carregadas dinamicamente
│   ├── scripts/             # JavaScript (store, api, medicao, overview, config)
│   └── styles/              # CSS por componente/tela
├── fotos/                   # Fotos de eventos de parada (geradas em runtime)
├── smartline.db             # Banco SQLite (gerado em runtime)
├── launcher.py              # Inicializador com threads para backend e frontend
├── start.bat                # Script de inicialização Windows
├── build.bat                # Script de build do executável
└── smartline.spec           # Configuração do PyInstaller
```

---

## Indicadores calculados

| Indicador | Descrição |
|---|---|
| **Disponibilidade** | Tempo rodando / Tempo total (descontando pausas programadas e paradas externas) |
| **Performance** | Produção real / Produção esperada no tempo rodando |
| **Qualidade** | (Produção − Refugo) / Produção |
| **OEE** | Disponibilidade × Performance × Qualidade |
| **MTBF** | Média dos intervalos de funcionamento entre paradas consecutivas |
| **MTTR** | Tempo médio de reparo (paradas internas / número de paradas internas) |

---

## Integração IoT — WISE-4051

O SmartLine suporta integração com dispositivos **Advantech WISE-4051** para medição semi-automática:

- **Canal Counter** — sensor de pulso para contagem de produção e detecção de marcha/parada por ausência de incremento
- **Canal DI** — sensor digital para detecção de estado da máquina
- **Fórmulas configuráveis** — define como calcular produção e refugo a partir dos counters (ex: `saída − inspetor`)
- **Polling a cada 5 segundos** — worker independente em thread daemon
- **Processamento a cada 10 segundos** — geração automática de eventos de marcha/parada e leituras de produção por slot horário

---

## Licença

Este projeto foi desenvolvido para fins acadêmicos e comerciais. Para uso em outros contextos, entre em contato com o autor.
