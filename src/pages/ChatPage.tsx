import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { PromptBar } from "../components/PromptBar";
import { useChat } from "../context/ChatContext";
import { useDocuments } from "../context/DocumentsContext";
import { AppShell } from "../layouts/AppShell";
import { LEARNING_ENVIRONMENT_LOGIN_CTA_LABEL } from "../chat/learningEnvironmentLoginHelp";
import type { ChatMessage } from "../types/chat";
import styles from "./ChatPage.module.css";

type LocationState = { initialMessage?: string };

const TITLE_MAX_LEN = 72;

function requestEfrontPlaywrightRunFromDevServer() {
  if (!import.meta.env.DEV) return;
  void fetch("/__kb/run-efront-e2e", {
    method: "POST",
    headers: { Accept: "application/json" },
  }).catch(() => {
    /* dev server may be absent in other environments */
  });
}

function AssistantAnswerBlock({ msg }: { msg: ChatMessage }) {
  const isLearningLoginCta =
    msg.cta?.label === LEARNING_ENVIRONMENT_LOGIN_CTA_LABEL && Boolean(msg.cta.href);

  return (
    <>
      <div
        className={`${styles.turnAnswerBody}${msg.pending ? ` ${styles.turnAnswerPending}` : ""}`}
      >
        {msg.text}
      </div>
      {msg.cta && !msg.pending ? (
        <div className={styles.ctaRow}>
          <a
            href={msg.cta.href}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.ctaLink}
            onClick={() => {
              if (isLearningLoginCta) requestEfrontPlaywrightRunFromDevServer();
            }}
          >
            {msg.cta.label}
          </a>
        </div>
      ) : null}
    </>
  );
}

type QATurn =
  | { kind: "pair"; user: ChatMessage; assistant?: ChatMessage }
  | { kind: "answerOnly"; assistant: ChatMessage };

/** One visual turn: Question (user) then Answer (assistant), like ChatGPT. */
function buildQATurns(messages: ChatMessage[]): QATurn[] {
  const out: QATurn[] = [];
  let i = 0;
  while (i < messages.length) {
    const m = messages[i];
    if (m.role === "user") {
      const next = messages[i + 1];
      if (next?.role === "assistant") {
        out.push({ kind: "pair", user: m, assistant: next });
        i += 2;
      } else {
        out.push({ kind: "pair", user: m, assistant: undefined });
        i += 1;
      }
    } else {
      out.push({ kind: "answerOnly", assistant: m });
      i += 1;
    }
  }
  return out;
}

export function ChatPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { getSession, appendUserAndReply, deleteSession, renameSessionTitle } = useChat();
  const { uploadFiles } = useDocuments();
  const initialHandled = useRef(false);
  const skipTitleBlur = useRef(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const session = chatId ? getSession(chatId) : undefined;
  const initialMessage = (location.state as LocationState | null)?.initialMessage;

  const handleUploadFiles = useCallback(
    async (files: File[]) => {
      if (!session || files.length === 0) return;
      setUploadBusy(true);
      setUploadNote(null);
      const { added, errors } = await uploadFiles(session.category, files);
      setUploadBusy(false);
      if (errors.length && !added.length) {
        setUploadNote(errors.join("\n"));
      } else if (errors.length) {
        setUploadNote(`Uploaded ${added.length} file(s). Some issues:\n${errors.join("\n")}`);
      } else {
        setUploadNote(`Added ${added.length} file(s) to your eFront workspace.`);
      }
      window.setTimeout(() => setUploadNote(null), 6000);
    },
    [session, uploadFiles]
  );

  useEffect(() => {
    setTitleEditing(false);
  }, [chatId]);

  useEffect(() => {
    if (!chatId || !session || !initialMessage?.trim()) return;
    if (initialHandled.current) return;
    if (session.messages.length > 0) return;
    initialHandled.current = true;
    appendUserAndReply(chatId, initialMessage.trim());
    navigate(location.pathname, { replace: true, state: {} });
  }, [
    appendUserAndReply,
    chatId,
    initialMessage,
    location.pathname,
    navigate,
    session,
  ]);

  if (!chatId) {
    return <Navigate to="/chat" replace />;
  }

  if (!session) {
    return <Navigate to="/chat" replace />;
  }

  const activeSession = session;

  const qaTurns = useMemo(() => buildQATurns(activeSession.messages), [activeSession.messages]);

  function beginTitleEdit() {
    setTitleDraft(activeSession.title);
    setTitleEditing(true);
    queueMicrotask(() => {
      const el = titleInputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    });
  }

  function finishTitleEdit(save: boolean) {
    if (save && chatId) renameSessionTitle(chatId, titleDraft);
    setTitleEditing(false);
  }

  function handleSend(text: string) {
    if (!chatId) return;
    appendUserAndReply(chatId, text);
  }

  function handleDeleteThisChat() {
    if (!chatId) return;
    deleteSession(chatId);
    navigate("/chat", { replace: true });
  }

  return (
    <AppShell>
      <div className={styles.chatPage}>
      <div className={styles.chatScroll}>
      <div className={styles.meta}>
        <div className={styles.metaLeft}>
          <span className={styles.badge}>{activeSession.category}</span>
          {titleEditing ? (
            <input
              ref={titleInputRef}
              className={styles.titleInput}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value.slice(0, TITLE_MAX_LEN))}
              maxLength={TITLE_MAX_LEN}
              aria-label="Chat title"
              onBlur={() => {
                if (skipTitleBlur.current) {
                  skipTitleBlur.current = false;
                  return;
                }
                finishTitleEdit(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  skipTitleBlur.current = true;
                  finishTitleEdit(true);
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  skipTitleBlur.current = true;
                  setTitleDraft(activeSession.title);
                  setTitleEditing(false);
                }
              }}
            />
          ) : (
            <div className={styles.titleBlock}>
              <span className={styles.title} title={activeSession.title}>
                {activeSession.title}
              </span>
              <button type="button" className={styles.renameChat} onClick={beginTitleEdit}>
                Rename
              </button>
            </div>
          )}
        </div>
        <button type="button" className={styles.deleteThread} onClick={handleDeleteThisChat}>
          Delete chat
        </button>
      </div>

      {uploadNote && <p className={styles.uploadNote}>{uploadNote}</p>}

      <div className={styles.body}>
        <div className={styles.thread}>
          <div className={styles.messages}>
            {activeSession.messages.length === 0 ? (
              <p className={styles.empty}>
                Ask about your eFront uploads. Add files from the sidebar (“Add files to eFront”) or
                with the paperclip — replies should stick to your documents and say when something is
                not in the files.
              </p>
            ) : (
              qaTurns.map((turn) => {
                if (turn.kind === "answerOnly") {
                  const a = turn.assistant;
                  return (
                    <article key={a.id} className={styles.turn}>
                      <div className={styles.turnAnswerBlock}>
                        <h3 className={styles.turnLabel}>Answer</h3>
                        <AssistantAnswerBlock msg={a} />
                      </div>
                    </article>
                  );
                }
                const { user, assistant } = turn;
                return (
                  <article key={user.id} className={styles.turn}>
                    <div className={styles.turnQuestionBlock}>
                      <h3 className={styles.turnLabel}>Question</h3>
                      <p className={styles.turnQuestionBody}>{user.text}</p>
                    </div>
                    {assistant ? (
                      <div className={styles.turnAnswerBlock}>
                        <h3 className={styles.turnLabel}>Answer</h3>
                        <AssistantAnswerBlock msg={assistant} />
                      </div>
                    ) : (
                      <div className={styles.turnAnswerBlock}>
                        <h3 className={styles.turnLabel}>Answer</h3>
                        <p className={styles.turnAnswerPending}>Waiting for a reply…</p>
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </div>
      </div>
      </div>
      <div className={styles.footer}>
        <PromptBar
          onSubmit={handleSend}
          onFilesSelected={(files) => void handleUploadFiles(files)}
          attachDisabled={uploadBusy}
        />
      </div>
      </div>
    </AppShell>
  );
}
