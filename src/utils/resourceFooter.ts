/**
 * Build a short "Resources" appendix from merged RAG/keyword context so users see
 * which files (and optional page/module hints) were actually passed to the model.
 */
export function buildResourceFooterFromContext(documentContext: string): string {
  const raw = documentContext.trim();
  if (!raw) return "";

  const seen = new Set<string>();
  const entries: string[] = [];
  const re = /^Source:\s*(.+)$/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const line = m[1].trim().replace(/\s+/g, " ");
    if (!line || seen.has(line)) continue;
    seen.add(line);
    entries.push(line);
    if (entries.length >= 24) break;
  }
  if (!entries.length) return "";

  const bullets = entries.map((e) => `- ${e}`).join("\n");
  return `\n\n---\n**Resources (excerpts used for this answer):**\n${bullets}`;
}
