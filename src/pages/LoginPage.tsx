import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import { IconArrowUpRight } from "../components/Icons";
import { PromptBar } from "../components/PromptBar";
import { AppShell } from "../layouts/AppShell";
import styles from "./LoginPage.module.css";

type FromState = { from?: string };

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { createChat } = useChat();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as FromState | null)?.from;

  function goAfterAuth() {
    navigate(from && from !== "/login" ? from : "/chat", { replace: true });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email to continue.");
      return;
    }
    setError(null);
    login(trimmed);
    goAfterAuth();
  }

  function handleCardSignIn() {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email above, then tap Login again.");
      return;
    }
    setError(null);
    login(trimmed);
    goAfterAuth();
  }

  function handleCardSignUp() {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email above, then tap Sign up again.");
      return;
    }
    setError(null);
    login(trimmed);
    goAfterAuth();
  }

  function handlePrompt(text: string) {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email first so we can save your workspace.");
      return;
    }
    setError(null);
    login(trimmed);
    const id = createChat();
    if (id) {
      navigate(`/chat/${id}`, {
        replace: true,
        state: { initialMessage: text },
      });
    } else {
      navigate("/chat", { replace: true });
    }
  }

  return (
    <AppShell showSidebar={false}>
      <div className={styles.wrap}>
        <div className={styles.panel}>
          <h1 className={styles.headline}>
            How can we <span className={styles.em}>assist</span> you today?
          </h1>

          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.label}>
              Email
              <input
                className={styles.input}
                type="email"
                autoComplete="username"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className={styles.label}>
              Password (demo — not stored)
              <input
                className={styles.input}
                type="password"
                autoComplete="current-password"
                placeholder="Optional for this prototype"
              />
            </label>
            {error && <p className={styles.error}>{error}</p>}
            <button type="submit" className={styles.primary}>
              Continue
            </button>
          </form>

          <div className={styles.cards}>
            <button type="button" className={styles.card} onClick={handleCardSignIn}>
              <span className={styles.cardTop}>
                <span className={styles.cardTitle}>Login</span>
                <IconArrowUpRight className={styles.cardIcon} />
              </span>
              <p className={styles.cardBody}>
                Get tailored advice on increasing property visibility and driving sales.
              </p>
            </button>
            <button type="button" className={styles.card} onClick={handleCardSignUp}>
              <span className={styles.cardTop}>
                <span className={styles.cardTitle}>Sign up</span>
                <IconArrowUpRight className={styles.cardIcon} />
              </span>
              <p className={styles.cardBody}>
                Learn expert negotiation tips to close deals effectively.
              </p>
            </button>
          </div>

          <p className={styles.note}>
            This is a front-end demo: signing in saves your email in this browser only (
            <code>localStorage</code>). Hook up a real API when you are ready.
          </p>

          <p className={styles.back}>
            <Link to="/">Back to home</Link>
          </p>
        </div>
      </div>

      <div className={styles.footer}>
        <PromptBar onSubmit={handlePrompt} />
      </div>
    </AppShell>
  );
}
