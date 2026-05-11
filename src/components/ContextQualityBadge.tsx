import styles from "./ContextQualityBadge.module.css";

type Props = { contextChars: number | undefined };

export function ContextQualityBadge({ contextChars }: Props) {
  if (contextChars === undefined) return null;

  if (contextChars >= 3000) {
    return <span className={`${styles.badge} ${styles.good}`}>Answering from your docs</span>;
  }
  if (contextChars > 0) {
    return <span className={`${styles.badge} ${styles.thin}`}>Thin doc match — may hallucinate</span>;
  }
  return <span className={`${styles.badge} ${styles.none}`}>No doc context — will hallucinate</span>;
}
