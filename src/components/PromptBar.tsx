import { FormEvent, useRef, useState } from "react";
import { IconMic, IconPaperclip, IconSend } from "./Icons";
import styles from "./PromptBar.module.css";
import { KNOWLEDGE_FILE_ACCEPT } from "../utils/extractDocumentText";

type Props = {
  onSubmit?: (text: string) => void;
  /** Matches mobile hero mockup: paperclip + field + mic only */
  compact?: boolean;
  onFilesSelected?: (files: File[]) => void;
  attachDisabled?: boolean;
};

export function PromptBar({ onSubmit, compact, onFilesSelected, attachDisabled }: Props) {
  const showSend = !compact;
  const [value, setValue] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const t = value.trim();
    if (!t) return;
    onSubmit?.(t);
    setValue("");
  }

  function handleFileChange() {
    const input = fileRef.current;
    if (!input?.files?.length) return;
    const list = Array.from(input.files);
    onFilesSelected?.(list);
    input.value = "";
  }

  return (
    <form className={styles.wrap} onSubmit={handleSubmit}>
      <input
        ref={fileRef}
        type="file"
        className={styles.fileInput}
        accept={KNOWLEDGE_FILE_ACCEPT}
        multiple
        onChange={handleFileChange}
        aria-hidden
        tabIndex={-1}
      />
      <div className={styles.bar}>
        <button
          type="button"
          className={styles.iconBtn}
          aria-label="Attach file"
          disabled={attachDisabled || !onFilesSelected}
          onClick={() => fileRef.current?.click()}
        >
          <IconPaperclip className={styles.iconLight} />
        </button>
        <input
          className={styles.input}
          placeholder="type your prompt here"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Message"
        />
        <button type="button" className={styles.mic} aria-label="Voice input">
          <IconMic />
        </button>
        {showSend && (
          <button type="submit" className={styles.send} aria-label="Send">
            <IconSend className={styles.iconLight} />
          </button>
        )}
      </div>
    </form>
  );
}
