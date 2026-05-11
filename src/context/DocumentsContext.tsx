import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Category } from "../types/chat";
import { newId, normalizeCategory } from "../types/chat";
import { readAuthUserFromStorage, useAuth } from "./AuthContext";
import { isRagBackendConfigured, reindexUserDocuments } from "../services/ragBackend";
import { extractTextFromFile, truncateForStorage } from "../utils/extractDocumentText";
import { buildDocumentContextForQuery } from "../utils/documentRetrieval";

export type KnowledgeDocument = {
  id: string;
  category: Category;
  filename: string;
  text: string;
  uploadedAt: number;
};

type UploadResult = { added: KnowledgeDocument[]; errors: string[] };

type DocumentsContextValue = {
  documents: KnowledgeDocument[];
  listForCategory: (category: Category) => KnowledgeDocument[];
  uploadFiles: (category: Category, files: File[]) => Promise<UploadResult>;
  removeDocument: (id: string) => void;
  /** Plain-text excerpts from uploads in this category, biased toward the user query */
  buildContextForQuery: (category: Category, query: string) => string;
  /** Download JSON with every stored document (metadata + extracted text). */
  exportDocumentsJson: () => void;
  /** Remove every upload for this user from localStorage (and clear RAG index when API is on). */
  clearAllDocuments: () => void;
  /** Last RAG index error (e.g. server down); cleared on successful index. */
  ragIndexError: string | null;
};

const DocumentsContext = createContext<DocumentsContextValue | null>(null);

function docsKey(email: string) {
  return `kb-docs-v1-${email.toLowerCase()}`;
}

function loadDocs(email: string): KnowledgeDocument[] {
  try {
    const raw = localStorage.getItem(docsKey(email));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as KnowledgeDocument[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((d) => d && typeof d.id === "string" && typeof d.text === "string")
      .map((d) => ({
        ...d,
        category: normalizeCategory(d.category),
      }));
  } catch {
    return [];
  }
}

function saveDocs(email: string, docs: KnowledgeDocument[]) {
  localStorage.setItem(docsKey(email), JSON.stringify(docs));
}

function toRagPayload(docs: KnowledgeDocument[]) {
  return docs.map((d) => ({ id: d.id, text: d.text, filename: d.filename }));
}

export function DocumentsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [ragIndexError, setRagIndexError] = useState<string | null>(null);

  const syncRagIndex = useCallback((email: string, docs: KnowledgeDocument[]) => {
    if (!isRagBackendConfigured()) return;
    void reindexUserDocuments(email, toRagPayload(docs))
      .then(() => setRagIndexError(null))
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[RAG] Index failed:", msg);
        setRagIndexError(msg);
      });
  }, []);

  useEffect(() => {
    if (!user) {
      setDocuments([]);
      setRagIndexError(null);
      return;
    }
    setDocuments(loadDocs(user.email));
  }, [user?.email]);

  /** Push localStorage uploads to Chroma as soon as the user is known (fixes empty index after refresh / before first debounced run). */
  useEffect(() => {
    if (!user?.email || !isRagBackendConfigured()) return;
    const docs = loadDocs(user.email);
    syncRagIndex(user.email, docs);
  }, [user?.email, syncRagIndex]);

  const listForCategory = useCallback(
    (category: Category) => documents.filter((d) => d.category === category),
    [documents]
  );

  const removeDocument = useCallback(
    (id: string) => {
      const effective = user ?? readAuthUserFromStorage();
      if (!effective) return;
      setDocuments((prev) => {
        const next = prev.filter((d) => d.id !== id);
        saveDocs(effective.email, next);
        syncRagIndex(effective.email, next);
        return next;
      });
    },
    [user, syncRagIndex]
  );

  const uploadFiles = useCallback(
    async (category: Category, files: File[]): Promise<UploadResult> => {
      const effective = user ?? readAuthUserFromStorage();
      if (!effective) return { added: [], errors: ["Sign in to upload documents."] };

      const added: KnowledgeDocument[] = [];
      const errors: string[] = [];

      for (const file of files) {
        try {
          const raw = await extractTextFromFile(file);
          const text = truncateForStorage(raw);
          if (!text) {
            errors.push(`${file.name}: no text could be read.`);
            continue;
          }
          added.push({
            id: newId(),
            category,
            filename: file.name,
            text,
            uploadedAt: Date.now(),
          });
        } catch (e) {
          errors.push(
            `${file.name}: ${e instanceof Error ? e.message : "Could not read file."}`
          );
        }
      }

      if (added.length > 0) {
        setDocuments((prev) => {
          const next = [...added, ...prev];
          saveDocs(effective.email, next);
          syncRagIndex(effective.email, next);
          return next;
        });
      }

      return { added, errors };
    },
    [user, syncRagIndex]
  );

  const buildContextForQuery = useCallback(
    (category: Category, query: string) => {
      const subset = documents.filter((d) => d.category === category);
      return buildDocumentContextForQuery(
        subset.map((d) => ({ filename: d.filename, text: d.text })),
        query,
        38_000
      );
    },
    [documents]
  );

  const clearAllDocuments = useCallback(() => {
    const effective = user ?? readAuthUserFromStorage();
    if (!effective) return;
    setDocuments([]);
    saveDocs(effective.email, []);
    syncRagIndex(effective.email, []);
  }, [user, syncRagIndex]);

  const exportDocumentsJson = useCallback(() => {
    if (!user?.email) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      app: "LeadingMile Knowledge Base",
      localStorageKey: docsKey(user.email),
      note:
        "Each item contains extracted plain text from the file you picked (not the original PDF/Word binary). Originals remain on your disk unless you delete them.",
      ragNote:
        "After upload, the same text is sent to the RAG indexer when the API is configured (e.g. npm run rag:dev + /api/rag in dev).",
      documents: documents.map((d) => ({
        id: d.id,
        category: d.category,
        filename: d.filename,
        uploadedAt: d.uploadedAt,
        uploadedAtIso: new Date(d.uploadedAt).toISOString(),
        textCharCount: d.text.length,
        text: d.text,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safe = user.email.replace(/[^a-z0-9]+/gi, "-").slice(0, 40);
    a.download = `kb-uploads-${safe}-${Date.now()}.json`;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [user?.email, documents]);

  const value = useMemo(
    () => ({
      documents,
      listForCategory,
      uploadFiles,
      removeDocument,
      buildContextForQuery,
      exportDocumentsJson,
      clearAllDocuments,
      ragIndexError,
    }),
    [
      documents,
      listForCategory,
      uploadFiles,
      removeDocument,
      buildContextForQuery,
      exportDocumentsJson,
      clearAllDocuments,
      ragIndexError,
    ]
  );

  return <DocumentsContext.Provider value={value}>{children}</DocumentsContext.Provider>;
}

export function useDocuments(): DocumentsContextValue {
  const ctx = useContext(DocumentsContext);
  if (!ctx) throw new Error("useDocuments must be used within DocumentsProvider");
  return ctx;
}
