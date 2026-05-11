import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Category, ChatMessage, ChatSession } from "../types/chat";
import { newId, normalizeCategory } from "../types/chat";
import { readAuthUserFromStorage, useAuth } from "./AuthContext";
import { useDocuments } from "./DocumentsContext";
import { isLlmConfigured } from "../llm/llmConfig";
import { fetchChatCompletion } from "../llm/openaiCompatible";
import { stripAssistantFileReferences } from "../llm/answerCleanup";
import {
  buildNoDocumentContextReply,
  buildRagLastUserSuffix,
  buildSystemPrompt,
  sessionToApiMessages,
} from "../llm/knowledgeBasePrompt";
import { fetchRagContext, isRagBackendConfigured } from "../services/ragBackend";
import type { SourceImage } from "../types/chat";
import {
  buildLearningEnvironmentLoginHelpReply,
  getLearningEnvironmentLoginCta,
  isLearningEnvironmentLoginHelpRequest,
} from "../chat/learningEnvironmentLoginHelp";
import { mergeRagWithKeywordBudget } from "../utils/mergeRetrievalContext";
import { buildResourceFooterFromContext } from "../utils/resourceFooter";

type ChatContextValue = {
  activeCategory: Category;
  sessions: ChatSession[];
  orderedSessionIds: string[];
  createChat: (category?: Category) => string;
  getSession: (id: string) => ChatSession | undefined;
  appendUserAndReply: (chatId: string, text: string) => void;
  renameSessionTitle: (chatId: string, title: string) => void;
  deleteSession: (chatId: string) => void;
};

const ChatContext = createContext<ChatContextValue | null>(null);

function chatsKey(email: string) {
  return `kb-chats-v1-${email.toLowerCase()}`;
}

function loadSessions(email: string): ChatSession[] {
  try {
    const raw = localStorage.getItem(chatsKey(email));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatSession[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => s && typeof s.id === "string")
      .map((s) => ({
        ...s,
        category: normalizeCategory(s.category),
        messages: Array.isArray(s.messages)
          ? s.messages.map((m: ChatMessage) =>
              m?.pending && m.role === "assistant"
                ? {
                    ...m,
                    pending: false,
                    text: "Previous reply did not finish (reload or new tab). Send your message again.",
                  }
                : m
            )
          : [],
      }));
  } catch {
    return [];
  }
}

function saveSessions(email: string, sessions: ChatSession[]) {
  localStorage.setItem(chatsKey(email), JSON.stringify(sessions));
}

/** Extra literal terms for client-side / RAG retrieval when the question is broad (e.g. access rights). */
function extraRetrievalHints(userText: string): string {
  const t = userText.toLowerCase();
  if (
    !/\befront\b/.test(t) &&
    !/\b(access|right|auth|profile|region|permission|visibility|authorization|customize|workflow|object|report|query)\b/.test(
      t,
    )
  ) {
    return "";
  }
  return "\nRetrieval hints: eFront Invest alternative investments fund administration private equity NOT eFront LMS CMS access rights authorization authentication user profiles user groups roles regions data access segregation customize access rights conditions global access rights pages sections controls buttons fields lookup filters context menu visibility accessibility mandatory warning error workflow workflow-based permissions security objects funds companies deals operations reports query builder documents tables server customization configuration administrator";
}

/**
 * Build the string used for RAG + keyword retrieval.
 * Uses **user messages only** — do not append previous assistant replies: a wrong/hallucinated
 * answer (e.g. mixing up eFront CMS vs eFront Invest) would poison embeddings search.
 */
function buildRetrievalQuery(
  priorForApi: ChatMessage[],
  userText: string,
  category: Category
): string {
  const priorUsers = priorForApi.filter((m) => m.role === "user").map((m) => m.text);
  const lines = [...priorUsers.slice(-8), userText];
  let core = lines.join("\n") + extraRetrievalHints(userText);
  if (category === "eFront") {
    core =
      "eFront Invest alternative investments fund administration private equity software (NOT eFront LMS open-source CMS). " +
      "manual documentation guide procedure steps configuration UI menu screen wizard: " +
      core;
  }
  return core.slice(-22_000);
}

/** True when the user's question touches eFront configuration concepts. */
function isConfigurationQuestion(text: string): boolean {
  return /\b(access.?right|user.?right|condition|region|profile|page|section|control|button|field|visib|accessib|workflow|permission|customize|global|mandatory|warning|error|hide|show|enable|disable|lookup|dynamic|fund|company|deal|report|query)\b/i.test(text);
}

/**
 * Sub-queries targeting distinct document types so Chroma is asked from
 * different semantic directions. Each query targets a different eFront doc category.
 */
const AR_SUB_QUERIES = [
  // targets User Rights Management PDF / Administrator Guide
  "eFront user administration rights management system administrator users groups configuration guide",
  // targets workflow / fund operations docs
  "eFront workflow status fund operations regions data segregation multi-client visibility",
  // targets fields / validation / conditions docs
  "eFront mandatory warning error field validation conditions JavaScript profile object state",
];

/**
 * Extract the Source: filename from a RAG chunk (first line beginning with "Source:").
 */
function chunkSource(chunk: string): string {
  const m = chunk.match(/^Source:\s*(.+)$/m);
  return m ? m[1].trim() : "__unknown__";
}

/**
 * Re-order deduplicated chunks so that each unique source file gets at least
 * MIN_PER_SOURCE slots before the dominant document fills the rest of the budget.
 * This prevents one high-scoring file from monopolising the context window.
 */
function diversifyBySource(chunks: string[], minPerSource: number, maxChars: number): string[] {
  const CHUNK_SEP_LEN = "\n\n══════════════\n\n".length;

  // Group chunks by source filename
  const bySource = new Map<string, string[]>();
  for (const chunk of chunks) {
    const src = chunkSource(chunk);
    if (!bySource.has(src)) bySource.set(src, []);
    bySource.get(src)!.push(chunk);
  }

  // First pass: guaranteed slots for every source
  const guaranteed: string[] = [];
  const overflow: string[] = [];
  for (const sourceChunks of bySource.values()) {
    guaranteed.push(...sourceChunks.slice(0, minPerSource));
    overflow.push(...sourceChunks.slice(minPerSource));
  }

  // Fill remaining budget with leftover chunks
  const ordered = [...guaranteed, ...overflow];
  let used = 0;
  const result: string[] = [];
  for (const chunk of ordered) {
    const cost = chunk.length + CHUNK_SEP_LEN;
    if (used + cost > maxChars) break;
    result.push(chunk);
    used += cost;
  }

  const uniqueSources = new Set(result.map(chunkSource));
  console.log(
    `[RAG diversity] ${result.length} chunks from ${uniqueSources.size} source(s):`,
    [...uniqueSources].join(", ")
  );
  return result;
}

/**
 * Run the main query plus targeted sub-queries in parallel, deduplicate by
 * content fingerprint, then enforce per-source diversity before returning.
 */
async function fetchMultiQueryRag(
  email: string,
  mainQuery: string,
  userText: string,
  k: number,
  maxChars: number
): Promise<{ context: string; imageRefs: SourceImage[] }> {
  const queries: string[] = [mainQuery];
  if (isConfigurationQuestion(userText)) {
    for (const sq of AR_SUB_QUERIES) {
      // Append a short slice of user text so Chroma stays on-topic per sub-query
      queries.push(sq + " — " + userText.slice(0, 200));
    }
  }

  const settled = await Promise.allSettled(
    queries.map((q) => fetchRagContext(email, q, k))
  );

  const CHUNK_SEP = "\n\n══════════════\n\n";
  const seen = new Set<string>();
  const allChunks: string[] = [];
  const images: SourceImage[] = [];

  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    const { context, imageRefs } = result.value;
    for (const img of imageRefs) images.push(img);
    if (!context?.trim()) continue;
    for (const chunk of context.split(CHUNK_SEP)) {
      const trimmed = chunk.trim();
      if (!trimmed) continue;
      // Deduplicate by first 140 chars of content
      const key = trimmed.replace(/\s+/g, " ").slice(0, 140);
      if (seen.has(key)) continue;
      seen.add(key);
      allChunks.push(trimmed);
    }
  }

  // Enforce source diversity: every document gets at least 2 slots before
  // the dominant file can fill the rest of the budget.
  const diverse = diversifyBySource(allChunks, 2, maxChars);
  return { context: diverse.join(CHUNK_SEP), imageRefs: images };
}

type LlmReplyJob = {
  chatId: string;
  pendingId: string;
  email: string;
  userText: string;
  category: Category;
  priorForApi: ChatMessage[];
  userMsg: ChatMessage;
};

type DemoReplyJob = {
  chatId: string;
  email: string;
  userText: string;
  category: Category;
};

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { buildContextForQuery, listForCategory } = useDocuments();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const activeCategory: Category = "eFront";

  useEffect(() => {
    if (!user) {
      setSessions([]);
      return;
    }
    setSessions(loadSessions(user.email));
  }, [user?.email]);

  const createChat = useCallback(
    (category?: Category): string => {
      const effective = user ?? readAuthUserFromStorage();
      if (!effective) return "";
      const cat = normalizeCategory(category ?? activeCategory);
      const id = newId();
      const session: ChatSession = {
        id,
        title: "New chat",
        category: cat,
        messages: [],
        updatedAt: Date.now(),
      };
      setSessions((prev) => {
        const next = [session, ...prev];
        saveSessions(effective.email, next);
        return next;
      });
      return id;
    },
    [user]
  );

  const getSession = useCallback(
    (id: string) => sessions.find((s) => s.id === id),
    [sessions]
  );

  const renameSessionTitle = useCallback(
    (chatId: string, title: string) => {
      const effective = user ?? readAuthUserFromStorage();
      if (!effective) return;
      const t = title.trim().slice(0, 72) || "New chat";
      setSessions((prev) => {
        const next = prev.map((s) =>
          s.id === chatId ? { ...s, title: t, updatedAt: Date.now() } : s
        );
        saveSessions(effective.email, next);
        return next;
      });
    },
    [user]
  );

  const deleteSession = useCallback(
    (chatId: string) => {
      const effective = user ?? readAuthUserFromStorage();
      if (!effective) return;
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== chatId);
        saveSessions(effective.email, next);
        return next;
      });
    },
    [user]
  );

  const runLlmReply = useCallback(
    async (job: LlmReplyJob) => {
      const { chatId, pendingId, email, userText, category, priorForApi, userMsg } = job;
      const historyForApi = [...priorForApi, userMsg];
      const retrievalQuery = buildRetrievalQuery(priorForApi, userText, category);
      /**
       * Context budget — 8 000 chars ≈ 2 000 tokens.
       * System prompt ≈ 800 tokens + context ≈ 2 000 + history ≈ 500 + user ≈ 50 → ~3 350 total.
       * Stays under the 6 000 TPM limit of Groq free-tier small models.
       * Multi-query RAG still surfaces content from multiple documents within this budget.
       * Do NOT lower below 6 000 (too few chunks for multi-doc synthesis).
       */
      const MAX_RETRIEVAL_CHARS = 8_000;
      /** Keyword windows from full documents (literal phrases, all uploaded files). */
      const keywordContext = buildContextForQuery(category, retrievalQuery);
      let fromDocs = keywordContext;
      let sourceImages: SourceImage[] = [];
      if (isRagBackendConfigured()) {
        try {
          /**
           * k=15 per sub-query. fetchMultiQueryRag runs 1 + 3 sub-queries for configuration
           * questions, deduplicates, then enforces per-source diversity so no single file
           * monopolises the context window.
           */
          const ragResult = await fetchMultiQueryRag(email, retrievalQuery, userText, 15, MAX_RETRIEVAL_CHARS);
          const rag = ragResult.context?.trim() ?? "";
          sourceImages = ragResult.imageRefs;
          const kw = keywordContext.trim();
          if (rag && kw) {
            const sep =
              "\n\n══════════════\n\n--- Keyword-aligned excerpts (same uploads; complements semantic search) ---\n\n";
            // minKeywordChars=3 000 ensures keyword excerpts (cross-doc literal hits) always
            // get a meaningful slice even when RAG chunks are plentiful.
            fromDocs = mergeRagWithKeywordBudget(rag, kw, sep, MAX_RETRIEVAL_CHARS, 3_000);
          } else if (rag) {
            fromDocs =
              rag.length <= MAX_RETRIEVAL_CHARS
                ? rag
                : `${rag.slice(0, MAX_RETRIEVAL_CHARS)}\n\n…(RAG context truncated)`;
          }
        } catch (e) {
          console.warn("[RAG search] exception:", e);
          /* keep keywordContext */
        }
      }

      /* Final hard cap */
      if (fromDocs.length > MAX_RETRIEVAL_CHARS) {
        fromDocs = fromDocs.slice(0, MAX_RETRIEVAL_CHARS) + "\n\n…(context truncated to fit model limit)";
      }

      const uploadsInCategory = listForCategory(category).length;
      if (
        uploadsInCategory > 0 &&
        keywordContext.trim().length < 400 &&
        fromDocs.trim().length < 800
      ) {
        fromDocs =
          `NOTE FOR MODEL: The user has ${uploadsInCategory} uploaded file(s) in this workspace, but the combined retrieved text is short. Possibilities: scanned PDFs without extractable text, RAG/embeddings server not running or index still updating, or the question does not match wording in the manuals. Do not invent procedure details; state that evidence from the uploads is insufficient and suggest checking extraction (export JSON to verify text), RAG status in the sidebar, and rephrasing using terms from the manual.\n\n` +
          fromDocs;
      }

      const system = buildSystemPrompt(fromDocs, userText);

      let assistantText: string;
      try {
        if (!fromDocs.trim()) {
          assistantText = buildNoDocumentContextReply();
        } else {
          const messages = sessionToApiMessages(historyForApi, system, {
            appendToLastUser: buildRagLastUserSuffix(),
          });
          assistantText = stripAssistantFileReferences(
            await fetchChatCompletion({ messages })
          );
          const resourceFooter = buildResourceFooterFromContext(fromDocs);
          if (resourceFooter) assistantText += resourceFooter;
        }
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        assistantText = `The model could not complete this reply (${err}).\n\nYou can check VITE_LLM_BASE_URL, VITE_LLM_MODEL, and VITE_LLM_API_KEY (Groq/Together/etc.) or run Ollama locally.\n\n---\nDocument excerpts used as context:\n${fromDocs || "(no uploaded documents)"}\n---`;
      }

      setSessions((prev) => {
        const s = prev.find((x) => x.id === chatId);
        if (!s) return prev;
        const stillPending = s.messages.some((m) => m.id === pendingId && m.pending);
        if (!stillPending) return prev;

        const next = prev.map((x) => {
          if (x.id !== chatId) return x;
          return {
            ...x,
            messages: x.messages.map((m) =>
              m.id === pendingId
                ? { ...m, text: assistantText, pending: false, contextChars: fromDocs.trim().length, sourceImages: sourceImages.length > 0 ? sourceImages : undefined }
                : m
            ),
            updatedAt: Date.now(),
          };
        });
        saveSessions(email, next);
        return next;
      });
    },
    [buildContextForQuery, listForCategory]
  );

  const runLearningEnvironmentShortcutReply = useCallback(
    (job: { chatId: string; pendingId: string; email: string }) => {
      const assistantText = buildLearningEnvironmentLoginHelpReply();
      setSessions((prev) => {
        const s = prev.find((x) => x.id === job.chatId);
        if (!s) return prev;
        const stillPending = s.messages.some((m) => m.id === job.pendingId && m.pending);
        if (!stillPending) return prev;

        const next = prev.map((x) => {
          if (x.id !== job.chatId) return x;
          return {
            ...x,
            messages: x.messages.map((m) =>
              m.id === job.pendingId
                ? {
                    ...m,
                    text: assistantText,
                    pending: false,
                    cta: getLearningEnvironmentLoginCta(),
                  }
                : m
            ),
            updatedAt: Date.now(),
          };
        });
        saveSessions(job.email, next);
        return next;
      });
    },
    []
  );

  const appendUserAndReply = useCallback(
    (chatId: string, text: string) => {
      const trimmed = text.trim();
      const effective = user ?? readAuthUserFromStorage();
      if (!trimmed || !effective) return;

      const userMsg: ChatMessage = { id: newId(), role: "user", text: trimmed };
      const session = sessions.find((s) => s.id === chatId);
      if (!session) return;
      if (session.messages.some((m) => m.id === userMsg.id)) return;

      const priorForApi = session.messages.filter((m) => !m.pending);
      const isFirstUser = !priorForApi.some((m) => m.role === "user");
      const category = session.category;
      const useLlm = isLlmConfigured();
      const shortcutMatch = isLearningEnvironmentLoginHelpRequest(trimmed);

      const pendingId = useLlm ? newId() : "";
      const pendingMsg: ChatMessage | null = useLlm
        ? {
            id: pendingId,
            role: "assistant",
            text: "Thinking…",
            pending: true,
          }
        : null;

      const llmJob: LlmReplyJob | null = useLlm
        ? {
            chatId,
            pendingId,
            email: effective.email,
            userText: trimmed,
            category,
            priorForApi,
            userMsg,
          }
        : null;

      const demoJob: DemoReplyJob | null = useLlm
        ? null
        : {
            chatId,
            email: effective.email,
            userText: trimmed,
            category,
          };

      setSessions((prev) => {
        const s = prev.find((x) => x.id === chatId);
        if (!s) return prev;
        if (s.messages.some((m) => m.id === userMsg.id)) return prev;

        if (useLlm && pendingMsg) {
          const next = prev.map((x) => {
            if (x.id !== chatId) return x;
            return {
              ...x,
              messages: [...x.messages, userMsg, pendingMsg],
              updatedAt: Date.now(),
              title: isFirstUser ? trimmed.slice(0, 48) || "New chat" : x.title,
            };
          });
          saveSessions(effective.email, next);
          return next;
        }

        const next = prev.map((x) => {
          if (x.id !== chatId) return x;
          return {
            ...x,
            messages: [...x.messages, userMsg],
            updatedAt: Date.now(),
            title: isFirstUser ? trimmed.slice(0, 48) || "New chat" : x.title,
          };
        });
        saveSessions(effective.email, next);
        return next;
      });

      if (llmJob) {
        queueMicrotask(() => {
          if (isLearningEnvironmentLoginHelpRequest(llmJob.userText)) {
            runLearningEnvironmentShortcutReply({
              chatId: llmJob.chatId,
              pendingId: llmJob.pendingId,
              email: llmJob.email,
            });
            return;
          }
          void runLlmReply(llmJob);
        });
      } else if (demoJob) {
        const job = demoJob;
        if (shortcutMatch) {
          window.setTimeout(() => {
            setSessions((prev) => {
              const s = prev.find((x) => x.id === job.chatId);
              if (!s) return prev;
              const assistantMsg: ChatMessage = {
                id: newId(),
                role: "assistant",
                text: buildLearningEnvironmentLoginHelpReply(),
                cta: getLearningEnvironmentLoginCta(),
              };
              const next = prev.map((x) =>
                x.id === job.chatId
                  ? {
                      ...x,
                      messages: [...x.messages, assistantMsg],
                      updatedAt: Date.now(),
                    }
                  : x
              );
              saveSessions(job.email, next);
              return next;
            });
          }, 150);
        } else {
          window.setTimeout(() => {
            setSessions((prev) => {
              const s = prev.find((x) => x.id === job.chatId);
              if (!s) return prev;
              const fromDocs = buildContextForQuery(job.category, job.userText.trim());
              const docSection = fromDocs
                ? `From your uploaded documents:\n${fromDocs}\n\n`
                : `No uploaded documents yet. Use the sidebar or paperclip to add PDF, Word, PowerPoint, Excel, CSV, HTML, TXT, or Markdown so replies can use them.\n\n`;

              const assistantMsg: ChatMessage = {
                id: newId(),
                role: "assistant",
                text: `${docSection}(Demo assistant — set VITE_LLM_BASE_URL + VITE_LLM_MODEL for a real Llama endpoint.)\nYour question: “${job.userText}”\n\nIf a model is connected, it would answer using the excerpts above when they are relevant.`,
              };
              const next = prev.map((x) =>
                x.id === job.chatId
                  ? {
                      ...x,
                      messages: [...x.messages, assistantMsg],
                      updatedAt: Date.now(),
                    }
                  : x
              );
              saveSessions(job.email, next);
              return next;
            });
          }, 400);
        }
      }
    },
    [user, sessions, buildContextForQuery, runLlmReply, runLearningEnvironmentShortcutReply]
  );

  const orderedSessionIds = useMemo(() => {
    const list = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
    return list.filter((s) => s.category === activeCategory).map((s) => s.id);
  }, [sessions, activeCategory]);

  const value = useMemo(
    () => ({
      activeCategory,
      sessions,
      orderedSessionIds,
      createChat,
      getSession,
      appendUserAndReply,
      renameSessionTitle,
      deleteSession,
    }),
    [
      activeCategory,
      sessions,
      orderedSessionIds,
      createChat,
      getSession,
      appendUserAndReply,
      renameSessionTitle,
      deleteSession,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
