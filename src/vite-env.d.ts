/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL including `/v1`, e.g. `https://api.groq.com/openai/v1` or `http://127.0.0.1:11434/v1` */
  readonly VITE_LLM_BASE_URL?: string;
  /** Model id at that provider, e.g. `llama-3.3-70b-versatile` (Groq) or `llama3.2` (Ollama). */
  readonly VITE_LLM_MODEL?: string;
  /** Optional; omit for local Ollama. Never commit real keys — use a server proxy in production when possible. */
  readonly VITE_LLM_API_KEY?: string;
  readonly VITE_LLM_MAX_TOKENS?: string;
  readonly VITE_LLM_TEMPERATURE?: string;
  /** Chroma RAG API (dev: `/api/rag` with Vite proxy → `server` on port 8000). */
  readonly VITE_RAG_API_URL?: string;
  /** Full URL to eFront learning login (`Login.aspx`); optional override for the in-chat “Open learning environment login” button. */
  readonly VITE_EFRONT_LEARNING_LOGIN_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}