import type { ApiChatMessage } from "./openaiCompatible";
import type { ChatMessage } from "../types/chat";
import { buildRagSystemPrompt } from "./ragSystemPrompt";

/** Shorter history = less noise from old wrong answers; enough for 1–2 follow-ups. */
const MAX_HISTORY = 12;
const MAX_MSG_CHARS = 24_000;

/**
 * Shown when retrieval produced no text — avoids calling the LLM with empty context.
 */
export function buildNoDocumentContextReply(): string {
  return [
    "**Nema teksta iz tvojih dokumenata u ovom upitu.**",
    "",
    "1. Dodaj fajl (PDF, Word, PPT, Excel, CSV, HTML, TXT, Markdown) preko sidebar-a ili paperclip-a.",
    "2. Za **semantic RAG** (preporučeno): u terminalu `npm run rag:dev`, pa u `.env.local` postavi `VITE_RAG_API_URL=/api/rag` (u dev modu to je često već podrazumevano). Sačekaj par sekundi posle uploada da se indeks osveži.",
    "",
    "Bez učitanog teksta / indeksa model nema šta da „pročita“ iz tvojih fajlova.",
  ].join("\n");
}

/** Appended only on the wire to the last user message — improves adherence to RAG on small models. */
export function buildRagLastUserSuffix(): string {
  return "\n\n[Assistant instructions: Use **only** the **DOCUMENT CONTEXT** in the system message (eFront Invest). When that context is rich enough, write **detailed consultant-style learning notes**—deep explanations, linked concepts, practical examples from the docs, headings and prose—not a short bullet-only summary. No generic access-rights or IT-law essays. If the excerpts are thin, say so clearly instead of inventing.]";
}

/**
 * System prompt for chat: plain RAG over `docExcerpt` (uploads + Chroma).
 * @param userQuestion Passed into the RAG closing block so the model stays on-topic.
 */
export function buildSystemPrompt(docExcerpt: string, userQuestion?: string): string {
  const trimmed = docExcerpt.trim();
  if (trimmed) {
    return buildRagSystemPrompt(trimmed, userQuestion);
  }

  return `You are the **Junior eFront Consultant Assistant** for this app, but there is **no** document context in this request.

“eFront” here means **eFront Invest** (financial / fund software)—never the unrelated **eFront LMS/CMS**.

Do **not** answer the substantive question from general web or CMS knowledge. In one short paragraph: ask the user to upload manuals and (if they use RAG) start the indexer and wait. Match the user's language if possible.`;
}

export function sessionToApiMessages(
  history: ChatMessage[],
  systemPrompt: string,
  options?: { appendToLastUser?: string }
): ApiChatMessage[] {
  const mapped = history
    .filter((m) => !m.pending)
    .slice(-MAX_HISTORY)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.text.length > MAX_MSG_CHARS ? `${m.text.slice(0, MAX_MSG_CHARS)}…` : m.text,
    }));
  let core = mapped;
  const suffix = options?.appendToLastUser?.trim();
  if (suffix && core.length > 0) {
    const lastIdx = core.length - 1;
    const last = core[lastIdx]!;
    if (last.role === "user") {
      core = [
        ...core.slice(0, lastIdx),
        { role: "user" as const, content: last.content + (last.content.endsWith("\n") ? "" : "\n") + suffix },
      ];
    }
  }
  return [{ role: "system", content: systemPrompt }, ...core];
}
