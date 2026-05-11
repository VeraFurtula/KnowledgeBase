import { useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

import { useChat } from "../context/ChatContext";

import { PromptBar } from "../components/PromptBar";

import { AppShell } from "../layouts/AppShell";

import { FAVICON_PNG } from "../brand";

import styles from "./HomePage.module.css";



export function HomePage() {

  const navigate = useNavigate();

  const { user } = useAuth();

  const { createChat } = useChat();



  function requireAuthThen(run: () => void) {

    if (!user) {

      navigate("/login", { state: { from: "/chat" } });

      return;

    }

    run();

  }



  function openChat(initialMessage?: string) {

    requireAuthThen(() => {

      const id = createChat("eFront");

      if (id) {

        navigate(`/chat/${id}`, {

          state: initialMessage ? { initialMessage } : undefined,

        });

      }

    });

  }



  return (

    <AppShell>
      <div className={styles.homeShell}>
      <div className={styles.homeScroll}>
      <div className={styles.center}>

        <div className={styles.hero}>

          <img

            src={FAVICON_PNG}

            alt=""

            className={styles.heroMark}

            width={80}

            height={80}

            decoding="async"

          />

          <h1 className={styles.kicker}>Knowledge Base</h1>

          <h2 className={styles.headline}>

            Ask questions about your <span className={styles.em}>eFront</span> documents

          </h2>

          <p className={styles.sub}>

            Upload exports (PDF, Excel, Word, and more) from the sidebar or in chat. Answers are

            meant to follow your files—when something is not in the uploads, the assistant should say

            so instead of guessing.

          </p>

        </div>



        <div className={styles.singleCta}>

          <button type="button" className={styles.primaryBtn} onClick={() => openChat()}>

            Open eFront chat

          </button>

        </div>

      </div>
      </div>

      <div className={styles.footer}>

        <div className={styles.promptOuter}>

          <div className={styles.promptDesktop}>

            <PromptBar onSubmit={(text) => openChat(text)} />

          </div>

          <div className={styles.promptMobile}>

            <PromptBar compact onSubmit={(text) => openChat(text)} />

          </div>

        </div>

      </div>
      </div>

    </AppShell>

  );

}

