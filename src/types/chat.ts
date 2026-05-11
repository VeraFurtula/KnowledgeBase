/** Single workspace: document Q&A for eFront-related uploads. */
export const CATEGORIES = ["eFront"] as const;
export type Category = (typeof CATEGORIES)[number];

const LEGACY_CATEGORIES = ["General", "Sales", "Negotiation", "Marketing", "eFront"] as const;

export function normalizeCategory(raw: unknown): Category {
  if (typeof raw === "string" && (LEGACY_CATEGORIES as readonly string[]).includes(raw)) {
    return "eFront";
  }
  return "eFront";
}

export type SourceImage = {
  source: string;
  slide: number;
  url: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** True while waiting for the model (OpenAI-compatible API). */
  pending?: boolean;
  /** Optional call-to-action shown under the answer (not sent to the LLM). */
  cta?: { label: string; href: string };
  /** Characters of document context that reached the model for this answer. */
  contextChars?: number;
  /** Slide images from the RAG-retrieved source documents. */
  sourceImages?: SourceImage[];
};

export type ChatSession = {
  id: string;
  title: string;
  category: Category;
  messages: ChatMessage[];
  updatedAt: number;
};

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
