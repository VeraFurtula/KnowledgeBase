/**
 * Remove bracketed file citations (e.g. `[export.pptx]`) from model replies.
 * Keeps answers readable without source tags the user did not ask for.
 */
export function stripAssistantFileReferences(text: string): string {
  const withoutTags = text.replace(
    /\s*\[[^\]\n]*\.(?:pdf|docx?|xlsx?|xls|pptx?|csv|txt|md|markdown|html?|json|xml|zip)\]/gi,
    ""
  );
  return withoutTags
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
