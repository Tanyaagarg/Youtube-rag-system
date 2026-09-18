# ClipIQ

Turn any YouTube video into something you can search, question, and get straight answers from — grounded in the actual transcript, with clickable timestamps back to the exact moment.

<p align="center">
  <img alt="Python" src="https://img.shields.io/badge/Python-3.11-3776AB?style=flat-square&logo=python&logoColor=white" />
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white" />
  <img alt="LangChain" src="https://img.shields.io/badge/LangChain-0.3-1C3C3C?style=flat-square" />
  <img alt="ChromaDB" src="https://img.shields.io/badge/ChromaDB-0.4-5A3EE6?style=flat-square" />
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind-4.1-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" />
</p>

## What it does

Paste a YouTube URL. ClipIQ pulls the transcript and metadata, chunks and embeds it, and gives you two ways to use it:

- **Summary** — an executive-style overview with key takeaways, generated from the full transcript.
- **Chat** — ask anything about the video and get an answer grounded in the transcript, with a clickable timestamp that seeks the embedded player straight to that moment.

Every past video you've processed is saved locally and browsable from a history view, so you can jump back into a summary or chat without reprocessing.

## How it works

```
YouTube URL
  → transcript + metadata fetch (with fallback handling for flaky/missing captions)
  → chunking
  → local embeddings (Ollama / BGE-M3) → Chroma vector index
  → retrieval (self-query + semantic + timestamp-aware ranking)
  → LLM response (OpenRouter) → summary or grounded chat answer
```

## Tech stack

| Layer | Tools |
|---|---|
| Backend | FastAPI, Pydantic, LangChain |
| Retrieval | ChromaDB, self-query retrieval, hybrid ranking |
| Embeddings | Ollama (local, BGE-M3) |
| LLM | OpenRouter |
| Metadata | YouTube Data API |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, Framer Motion |

## Project layout

```
backend/
  app/
    config.py          env + model setup
    schemas.py          request/response models
    routes/video.py    API endpoints
    rag/
      pipeline.py            transcript → chunk → embed → retrieve → answer
      transcript.py          transcript + metadata fetch, fallback handling
      retriever.py           Chroma vector store + self-query retriever
      retrieval_helpers.py   ranking, timestamp extraction/alignment
      policy_helpers.py      routes a message to CHAT / RAG / SUMMARY
      embeddings.py          embedding wrapper with input sanitization
  main.py
  requirements.txt

frontend/
  src/
    pages/       Dashboard, Summarize, SummaryResult, History, Landing
    components/  Sidebar, BottomNav, Layout, GlobalToast
    lib/         api.ts (backend calls), history.ts (local history store)
```

## Running it locally

**Prerequisites:** Python 3.11, Node.js 18+, [Ollama](https://ollama.com) running locally, an OpenRouter API key, and a Google (YouTube Data API) key.

**Backend**
```bash
cd backend
python -m venv venv
venv\Scripts\activate      # or: source venv/bin/activate on macOS/Linux
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

Copy `backend/.env.example` to `backend/.env` and fill in:

| Variable | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | LLM calls (summary + chat generation) |
| `OPENROUTER_MODEL` | which model to route through OpenRouter |
| `GOOGLE_API_KEY` | YouTube Data API, for video metadata |
| `OLLAMA_EMBEDDING_MODEL` | local embedding model name (default `bge-m3`) |
| `FRONTEND_ORIGIN` | CORS origin allowed to call the backend |
| `CHROMA_PERSIST_DIR` | optional custom path for the vector store |

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | health check |
| `POST /api/process` | fetch transcript + metadata, build the vector index |
| `POST /api/chat` | ask a question about a processed video |
| `POST /api/summary` | generate the executive summary |
| `POST /api/cleanup` | drop a session's cached/persisted data |

## Notes

- **Vector indexes persist** to `backend/.chroma_db`, so a restart doesn't re-embed videos — reprocessing a known video loads it from disk in about a second.
- **Each chunk is embedded once.** The vectors computed while validating chunks are inserted straight into Chroma rather than recomputed.
- **Sessions survive restarts.** Chat history, summaries and starter questions are mirrored to `backend/.session_store/` (one JSON file per session, expired after 7 days via `SESSION_TTL_SECONDS`). Live objects stay in memory; this store is a small module (`rag/session_store.py`) meant to be swapped for Redis when running multiple servers.
- History of analysed videos is stored in the browser's `localStorage`.
- Embedding runs on CPU through Ollama at roughly one second per chunk, so long videos still take a few minutes on first processing.
