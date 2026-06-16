# Modernization IS – ВКР Баранов М.В.

Промышленный веб-прототип модульной информационной системы поддержки проекта инновационной модернизации.

## Что реализовано

- Светлый интерфейс в духе **liquid glass** с оранжевыми акцентами.
- **React + TypeScript** фронтенд.
- **FastAPI** backend с 4 расчётными модулями.
- Ручной ввод данных.
- Вставка готового **JSON**.
- Импорт **CSV / XLSX / JSON**.
- История расчётов.
- Единый комплексный расчёт проекта.
- Упоминание ВКР и автора: **Баранов М.В.**

## Структура

- `backend/` — API и расчётное ядро.
- `frontend/` — React-интерфейс.
- `docker-compose.yml` — быстрый запуск.

## Локальный запуск

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scriptsctivate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend будет доступен по адресу: `http://127.0.0.1:8000`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend будет доступен по адресу: `http://127.0.0.1:5173`

## Запуск через Docker Compose

```bash
docker compose up --build
```

## API

- `POST /api/production/calculate`
- `POST /api/robotics/calculate`
- `POST /api/risks/calculate`
- `POST /api/economics/calculate`
- `POST /api/full-project/calculate`
- `GET /api/history`
- `GET /api/demo-data`

## Замечание

Расчётное ядро построено на переработанных версиях исходных алгоритмов.
