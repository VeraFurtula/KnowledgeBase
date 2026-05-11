import { useMemo, useRef, useState, type MouseEvent } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import { useDocuments } from "../context/DocumentsContext";
import { isRagBackendConfigured } from "../services/ragBackend";
import { KNOWLEDGE_FILE_ACCEPT } from "../utils/extractDocumentText";
import {
  IconChat,
  IconFolder,
  IconGear,
  IconMore,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUser,
} from "./Icons";
import { LEADINGMILE_LOGO_PNG, LEADINGMILE_LOGO_FALLBACK } from "../brand";
import styles from "./Sidebar.module.css";

type Props = {
  onClose?: () => void;
};

export function Sidebar({ onClose }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { activeCategory, orderedSessionIds, getSession, createChat, deleteSession } = useChat();
  const {
    documents,
    listForCategory,
    uploadFiles,
    exportDocumentsJson,
    clearAllDocuments,
    ragIndexError,
  } = useDocuments();
  const [query, setQuery] = useState("");
  const [sidebarUploadBusy, setSidebarUploadBusy] = useState(false);
  const [sidebarNote, setSidebarNote] = useState<string | null>(null);
  const categoryFileRef = useRef<HTMLInputElement>(null);

  const docCount = listForCategory(activeCategory).length;
  const totalStored = documents.length;
  const ragOn = isRagBackendConfigured();

  const filteredIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orderedSessionIds;
    return orderedSessionIds.filter((id) => {
      const s = getSession(id);
      return s?.title.toLowerCase().includes(q);
    });
  }, [orderedSessionIds, query, getSession]);

  function handleNewChat() {
    const id = createChat();
    if (id) navigate(`/chat/${id}`);
    onClose?.();
  }

  function handleDeleteChat(chatId: string, e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    deleteSession(chatId);
    if (location.pathname === `/chat/${chatId}`) {
      navigate("/chat", { replace: true });
    }
  }

  async function handleCategoryFiles(list: FileList | null) {
    if (!list?.length) return;
    const files = Array.from(list);
    categoryFileRef.current && (categoryFileRef.current.value = "");
    setSidebarUploadBusy(true);
    setSidebarNote(null);
    const { added, errors } = await uploadFiles(activeCategory, files);
    setSidebarUploadBusy(false);
    if (errors.length && !added.length) {
      setSidebarNote(errors.join(" "));
    } else if (errors.length) {
      setSidebarNote(`Added ${added.length}. ${errors.join(" ")}`);
    } else {
      setSidebarNote(`Added ${added.length} file(s).`);
    }
    window.setTimeout(() => setSidebarNote(null), 5000);
  }

  function handleLogout() {
    logout();
    onClose?.();
    navigate("/");
  }

  return (
    <aside className={styles.root}>
      <input
        ref={categoryFileRef}
        type="file"
        className={styles.hiddenFile}
        accept={KNOWLEDGE_FILE_ACCEPT}
        multiple
        onChange={(e) => void handleCategoryFiles(e.target.files)}
      />

      <div className={styles.topRow}>
        <Link
          to="/"
          className={styles.logoSlot}
          onClick={onClose}
          aria-label="LeadingMile — Home"
        >
          <img
            className={styles.sidebarBrandImg}
            src={LEADINGMILE_LOGO_PNG}
            alt="LeadingMile"
            width={220}
            height={40}
            decoding="async"
            onError={(e) => {
              const el = e.currentTarget;
              if (!el.dataset.fallback) {
                el.dataset.fallback = "1";
                el.src = LEADINGMILE_LOGO_FALLBACK;
              }
            }}
          />
        </Link>
        <button type="button" className={styles.ghostIcon} aria-label="More">
          <IconMore />
        </button>
      </div>

      <button type="button" className={styles.newChat} onClick={handleNewChat}>
        <span>New Chat</span>
        <IconPlus />
      </button>

      <label className={styles.searchLabel}>
        <IconSearch className={styles.searchIcon} />
        <input
          className={styles.search}
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search chats"
        />
      </label>

      <p className={styles.sectionLabel}>eFront workspace</p>
      <div className={`${styles.row} ${styles.rowActive}`} aria-current="true">
        <span className={styles.rowLeft}>
          <IconFolder />
          <span>eFront</span>
        </span>
      </div>

      <p className={styles.docCount}>
        {docCount} in this workspace · {totalStored} stored total
      </p>
      <p className={styles.storageHint}>
        Files are saved in this browser only (<code className={styles.mono}>localStorage</code> key{" "}
        <code className={styles.mono}>kb-docs-v1-…</code>
        ). RAG API: {ragOn ? "on" : "off"}
        {ragOn ? " (semantic search + excerpts)." : " (keyword excerpts only until RAG URL is set)."}
      </p>
      {ragOn && ragIndexError && (
        <p className={styles.ragIndexError} role="alert">
          RAG index: {ragIndexError}
        </p>
      )}

      <button
        type="button"
        className={styles.uploadCategory}
        disabled={sidebarUploadBusy}
        onClick={() => categoryFileRef.current?.click()}
      >
        {sidebarUploadBusy ? "Uploading…" : "Add files to eFront"}
      </button>
      <button
        type="button"
        className={styles.exportUploads}
        disabled={totalStored === 0}
        title="JSON with filenames, dates, and extracted text for every upload"
        onClick={() => {
          exportDocumentsJson();
          setSidebarNote("Download started (JSON export).");
          window.setTimeout(() => setSidebarNote(null), 4000);
        }}
      >
        Export all uploads (JSON)
      </button>
      <button
        type="button"
        className={styles.removeAllUploads}
        disabled={totalStored === 0}
        title="Deletes extracted text from this browser and clears your RAG index when the server is running"
        onClick={() => {
          if (
            !window.confirm(
              "Remove ALL uploaded documents from this browser for your account? This cannot be undone.",
            )
          ) {
            return;
          }
          clearAllDocuments();
          setSidebarNote("All uploads removed from this browser.");
          window.setTimeout(() => setSidebarNote(null), 5000);
        }}
      >
        Remove all uploads
      </button>
      {sidebarNote && <p className={styles.sidebarNote}>{sidebarNote}</p>}

      <p className={styles.sectionLabel}>Recent Chats</p>
      <ul className={styles.list}>
        {filteredIds.length === 0 ? (
          <li className={styles.emptyHint}>No chats yet.</li>
        ) : (
          filteredIds.map((id) => {
            const s = getSession(id);
            if (!s) return null;
            return (
              <li key={id} className={styles.chatRow}>
                <NavLink
                  to={`/chat/${id}`}
                  className={({ isActive }) =>
                    `${styles.chatLink} ${isActive ? styles.rowActive : ""}`
                  }
                  onClick={onClose}
                >
                  <span className={styles.rowLeft}>
                    <IconChat />
                    <span className={styles.truncate}>{s.title}</span>
                  </span>
                </NavLink>
                <button
                  type="button"
                  className={styles.deleteChat}
                  aria-label={`Delete chat ${s.title}`}
                  title="Delete chat"
                  onClick={(e) => handleDeleteChat(id, e)}
                >
                  <IconTrash />
                </button>
              </li>
            );
          })
        )}
      </ul>

      <div className={styles.spacer} />

      <div className={styles.profile}>
        <span className={styles.rowLeft}>
          <IconUser />
          <span className={styles.truncate} title={user?.email}>
            {user?.email ?? "User"}
          </span>
        </span>
        <div className={styles.profileActions}>
          <button type="button" className={styles.ghostIcon} aria-label="Settings">
            <IconGear />
          </button>
          <button type="button" className={styles.logoutBtn} onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>
    </aside>
  );
}
