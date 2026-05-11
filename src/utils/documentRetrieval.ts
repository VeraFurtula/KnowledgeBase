/** Minimal shape for retrieval (avoids importing from DocumentsContext). */
export type RetrievalDoc = { filename: string; text: string };

const STOP = new Set([
  "the",
  "and",
  "for",
  "you",
  "are",
  "was",
  "has",
  "have",
  "what",
  "when",
  "where",
  "how",
  "with",
  "from",
  "this",
  "that",
  "can",
  "not",
  "but",
  "into",
  "any",
  "all",
  "tell",
  "about",
  "need",
  "please",
  "your",
  "our",
  "will",
  "would",
  "could",
  "should",
  "does",
  "did",
  "its",
  "his",
  "her",
  "they",
  "them",
  "than",
  "then",
  "also",
  "just",
  "like",
  "such",
  "here",
  "there",
  "want",
  "give",
  "show",
  "find",
  "help",
  "me",
  "my",
]);

/** Tokens from the user + recent turns for literal match against documents. */
export function extractQueryTerms(query: string): string[] {
  const raw = query.toLowerCase();
  const tokens = raw.match(/[a-z0-9]+(?:['._-][a-z0-9]+)*/g) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    if (t.length < 2 && !/\d/.test(t)) continue;
    if (STOP.has(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 36) break;
  }
  return out;
}

function findOccurrences(haystackLower: string, needle: string): number[] {
  const hits: number[] = [];
  if (!needle.length || needle.length > 80) return hits;
  let pos = 0;
  while (pos < haystackLower.length) {
    const i = haystackLower.indexOf(needle, pos);
    if (i === -1) break;
    hits.push(i);
    pos = i + Math.max(1, needle.length);
    if (hits.length > 35) break;
  }
  return hits;
}

/** Merge nearby windows only; do not bridge large gaps (avoids one giant low-relevance span). */
function mergeIntervals(intervals: [number, number][], maxBridge = 2600): [number, number][] {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let [cs, ce] = sorted[0]!;
  for (let k = 1; k < sorted.length; k++) {
    const [s, e] = sorted[k]!;
    if (s <= ce + maxBridge) ce = Math.max(ce, e);
    else {
      out.push([cs, ce]);
      cs = s;
      ce = e;
    }
  }
  out.push([cs, ce]);
  return out;
}

function clipSpan(start: number, end: number, len: number, maxSpan: number): [number, number] {
  const s = Math.max(0, start);
  const e = Math.min(len, end);
  if (e - s <= maxSpan) return [s, e];
  return [s, s + maxSpan];
}

/**
 * Build plain-text context from uploaded docs: document starts, keyword-aligned windows,
 * and evenly spaced samples for long files (so answers are not only in the first ~1.4k chars).
 */
export function buildDocumentContextForQuery(
  docs: RetrievalDoc[],
  query: string,
  maxTotalChars = 28_000
): string {
  if (docs.length === 0) return "";

  const terms = extractQueryTerms(query);
  const docCountForBudget = Math.min(docs.length, 10);
  const perDocBudget = Math.max(4200, Math.floor(maxTotalChars / docCountForBudget));
  const headChars = 5200;
  const winBefore = 620;
  const winAfter = 1100;
  const maxSpan = 9000;

  const parts: string[] = [];

  for (const doc of docs) {
    const text = doc.text;
    if (!text.trim()) continue;
    const lower = text.toLowerCase();
    const len = text.length;

    const intervals: [number, number][] = [];

    // Always include start of file (headers, sheet names, cover tables).
    intervals.push([0, Math.min(headChars, len)]);

    for (const term of terms) {
      for (const hit of findOccurrences(lower, term)) {
        intervals.push(
          clipSpan(hit - winBefore, hit + winAfter, len, maxSpan)
        );
      }
    }

    // Long documents: add coverage when keywords miss or are sparse.
    if (len > 14_000) {
      const anchors = [0.06, 0.12, 0.22, 0.34, 0.46, 0.58, 0.7, 0.82, 0.92];
      for (const a of anchors) {
        const c = Math.floor(len * a);
        intervals.push(clipSpan(c - 750, c + 950, len, maxSpan));
      }
    } else if (len > 6000 && intervals.length < 4) {
      const anchors = [0.25, 0.5, 0.75];
      for (const a of anchors) {
        const c = Math.floor(len * a);
        intervals.push(clipSpan(c - 700, c + 900, len, maxSpan));
      }
    }

    const merged = mergeIntervals(intervals, 3200);
    const chunks: string[] = [];
    let used = 0;

    for (const [rawS, rawE] of merged) {
      if (used >= perDocBudget) break;
      const [s, e] = clipSpan(rawS, rawE, len, maxSpan);
      const slice = text.slice(s, e).trim();
      if (!slice) continue;
      chunks.push(slice);
      used += slice.length + 24;
    }

    if (chunks.length === 0) {
      chunks.push(text.slice(0, Math.min(perDocBudget, len)));
    }

    const block = `Source: ${doc.filename}\n${chunks.join("\n\n…\n\n")}`;
    parts.push(block);
  }

  let joined = parts.join("\n\n══════════════\n\n");
  if (joined.length > maxTotalChars) {
    joined = joined.slice(0, maxTotalChars) + "\n\n…(context truncated for the model; upload fewer or smaller files for fuller coverage)";
  }
  return joined;
}
