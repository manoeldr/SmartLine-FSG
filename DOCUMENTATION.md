# SmartLine Sanmartin - Documentação do Sistema

O **SmartLine Sanmartin** é uma aplicação completa (Fullstack) projetada para realizar o monitoramento e controle de produtividade de linhas de montagem, máquinas e equipamentos industriais. A ferramenta fornece tanto a capacidade de coleta manual de medições operacionais (paradas, apontamentos de produção, cadastro de motivos de falha, auditorias de processo) quanto o suporte a uma aquisição de dados semiautomática via módulos IoT (WISE da Advantech).

## Sumário

1. [Arquitetura Geral](#arquitetura-geral)
2. [Backend (Python / FastAPI)](#backend-python--fastapi)
3. [Frontend (Vanilla JS / CSS)](#frontend-vanilla-js--css)
4. [Banco de Dados](#banco-de-dados)
5. [Módulos e Integração IoT (WISE)](#módulos-e-integração-iot-wise)

---

## Arquitetura Geral

O sistema é dividido em duas camadas principais hospedadas habitualmente na mesma máquina ou servidor local da fábrica (On-Premises):
- **Backend API**: Escrito em Python utilizando o framework **FastAPI**. Responsável por toda a regra de negócio, integração com banco de dados SQLite via **SQLAlchemy**, endpoints REST e serviços em segundo plano (workers) para aquisição automática.
- **Frontend SPA**: Uma Single Page Application (SPA) construída em **HTML5, CSS3 puro e JavaScript baunilha** (ES Modules), com roteamento e carregamento dinâmico no navegador do dispositivo (desktop ou smartphone industrial).
- **Banco de Dados**: O sistema gerencia toda a persistência de dados localmente através do arquivo remoto `smartline.db` (SQLite).

---

## Backend (Python / FastAPI)

Localizado no diretório `backend/`, o sistema apresenta uma arquitetura MVC clássica para APIs modernas em Python, rodando pelo servidor uvicorn (no script de inicialização `start.bat` / `launcher.py`).

### Estrutura de Arquivos

- **`main.py`**: Ponto de entrada da aplicação FastAPI. Responsável pela inicialização das tabelas de banco de dados (`Base.metadata.create_all`), roteadores e injeção do CORS. Inclui também geradores de migrações em SQL cru para adicionar colunas em tabelas legadas sem depender totalmente do *Alembic*.
- **`database.py`**: Configuração central do SQLite, controle da sessão (SessionLocal) para injeção de dependências durante as requisições.
- **`auth.py`**: Controle de autenticação e tokens (JWT), definindo permissões para diferentes tipos e funções baseadas nos endpoints de login.
- **`calculations.py`**: Utilitários matemáticos e lógicos para o ecossistema e cálculos de produtividade (OEE, métricas).

### Subdiretórios do Backend

1. **`/models/`**: Definições das entidades do banco de dados (SQLAlchemy ORM).
   - `cliente.py`, `linha.py`, `maquina.py`, `maquina_linha.py`: Organização hierárquica industrial (Cliente -> Linha -> Máquina).
   - `medicao.py`, `evento.py`: Tabelas de fatos onde os dados transitórios são salvos (registros de tempo de produção, registro de paradas, alertas por evento na máquina).
   - `usuario.py`: Tabela de controle de credenciais.
2. **`/schemas/`**: Definição Pydantic para validação, serialização e tipagem dos dados de tráfego de entrada/saída nos endpoints REST (Tipagem estrita do FastAPI).
3. **`/routes/`**: Controladores que amarram as requisições HTTP aos dados e lógica. (Ex: criar uma nova medição, listar eventos, retornar dados para o *Dashboard*).

---

## Frontend (Vanilla JS / CSS)

O frontend interativo foi projetado pensando em confiabilidade sem depender de *build-steps* complicados (não usa npm para inicializar localmente), apenas módulos nativos (ECMAScript). Arquivos estáticos em `frontend/`.

- **Ponto de Entrada**: `index.html`. Possui a casca básica do layout: barra de navegação global, lógica de modais sobrepostos (Z-index altos para relatórios de Produção e Fim de Turno) e containers lógicos.
- **Interface e Roteamento**: Controlado na barra lateral da classe do HTML. Carrega pedaços do frontend via manipulação da arvore DOM sob demanda no JS.

### Estrutura de Arquivos de Lógica (`scripts/`)
- **`main.js`**: Gerencia a navegação global, mudança de temas de luz (Claro/Escuro), injeção principal do HTML e delegação estrutural.
- **`api.js`**: Reúne toda as requisições HTTP (`fetch`) do frontend com o Backend. Encapsula tratamentos de erro e a passagem do token autoral.
- **`store.js`**: Trata o estado *Global* no front do operador, gerenciando estados mutáveis da `medicao`, `config`, horários e leituras pendentes simulando Redux em vanilla JS.
- **`medicao.js` e `paradas.js`**: Módulos do core operacional e do trabalhador da ponta. Traz o loop local da máquina (Eventos de iniciar marcha e registrar paradas com fotos ou motivos - *Alarms*).
- **`overview.js` e `dashboard.js`**: Componentes da visão dos gestores. Exibem os OEEs reais, as linhas correntes e seus gráficos (utiliza `Chart.js`).

### Estilos UI/UX (`styles/`)
O software separa o Visual do Estrutural. Usa CSS puro com foco em custom properties (variáveis no root) para viabilizar temas escuros sem dor na manutenção:
- `base.css` e `global.css`: Reset e construtores de classe semântica global.
- `components.css`: Componentização de alertas, ícones, cards e botões.

---

## Banco de Dados

O banco SQLite é mapeado virtualmente com:
1. Cadastros Mestres (Tipos de evento da máquina, dados dos Clientes, Usuários)
2. Hierarquia Logística (Linhas, Máquinas e Vinculos)
3. Fatos Históricos:
   - `medicoes`: Cada "Sessão" de tempo que aponta que um operador esteve colhendo estatística.
   - `eventos`: Filhos diretos das medições que geram estado (quando parou, o motivo e foto).
(Foi percebido suporte a WAL mode localmente `-wal` `-shm` por performance superior e multi-thread limit in SQLite).

---

## Módulos e Integração IoT (WISE)

Dentro do Backend, na pasta `/semiauto/` percebem-se modelos e construtores que abstraem os equipamentos **Série WISE** (Tipicamente PLCs Modbus/REST/MQTT da Advantech). 
- Permite que o software consuma informações de produtividade diretamente pelo sensor de foto-células da garrafa, ou chaves do painel elétrico que apontam que a máquina parou sem que o operador dependa de clicar no botão "PARADA" pelo `medicao.js`. 
- **Workers em Backgound**: O backend se encarrega de ler o input periodicamente dependendo da latência em `tempo_sem_alteracao_segundos` usando rotinas assíncronas do python para dar trigger nos eventos.
