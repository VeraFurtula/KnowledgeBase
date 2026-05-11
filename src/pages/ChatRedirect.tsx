import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { takeFreshChatId } from "../chatBootstrap";
import { useChat } from "../context/ChatContext";
import styles from "./ChatRedirect.module.css";

/** `/chat` → creates a session and replaces URL with `/chat/:id` */
export function ChatRedirect() {
  const navigate = useNavigate();
  const { createChat } = useChat();

  useEffect(() => {
    const id = takeFreshChatId(() => createChat());
    if (id) navigate(`/chat/${id}`, { replace: true });
    else navigate("/login", { replace: true });
  }, [createChat, navigate]);

  return (
    <div className={styles.wrap}>
      <p className={styles.text}>Starting a new chat…</p>
    </div>
  );
}
