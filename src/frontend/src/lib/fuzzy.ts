import { OCR_CONFUSIONS } from '@/mock/vehicles';

/**
 * OCR-aware plate matching.
 *
 * A plain edit distance is the wrong tool here. When an operator types a plate
 * from a witness statement, the stored read may differ by exactly the characters
 * ANPR models confuse (0/O, 1/I, 8/B, 5/S). Those substitutions should barely
 * count against the match, while a genuinely different character should.
 */

/** Substitutions between confusable glyphs cost this instead of a full edit. */
const CONFUSION_COST = 0.22;

const confusable = new Set<string>();
for (const [char, alternatives] of Object.entries(OCR_CONFUSIONS)) {
  for (const alternative of alternatives) {
    confusable.add(`${char.toUpperCase()}>${alternative.toUpperCase()}`);
    confusable.add(`${alternative.toUpperCase()}>${char.toUpperCase()}`);
  }
}

function substitutionCost(a: string, b: string): number {
  if (a === b) return 0;
  return confusable.has(`${a}>${b}`) ? CONFUSION_COST : 1;
}

export interface PlateMatch {
  /** 0..1, where 1 is an exact match. */
  score: number;
  /** Human-readable list of the substitutions that were tolerated. */
  explanation: string[];
}

/**
 * Weighted Levenshtein with backtracking so the UI can explain *why* something
 * matched. Returns a normalised score plus the tolerated substitutions.
 */
export function plateSimilarity(query: string, candidate: string): PlateMatch {
  if (query === candidate) return { score: 1, explanation: [] };
  if (query.length === 0 || candidate.length === 0) return { score: 0, explanation: [] };

  const rows = query.length + 1;
  const cols = candidate.length + 1;
  const cost = new Float64Array(rows * cols);
  // 0 = diagonal, 1 = up (deletion), 2 = left (insertion)
  const trace = new Uint8Array(rows * cols);

  for (let i = 1; i < rows; i++) {
    cost[i * cols] = i;
    trace[i * cols] = 1;
  }
  for (let j = 1; j < cols; j++) {
    cost[j] = j;
    trace[j] = 2;
  }

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const diagonal = cost[(i - 1) * cols + (j - 1)] + substitutionCost(query[i - 1], candidate[j - 1]);
      const up = cost[(i - 1) * cols + j] + 1;
      const left = cost[i * cols + (j - 1)] + 1;

      let best = diagonal;
      let direction = 0;
      if (up < best) {
        best = up;
        direction = 1;
      }
      if (left < best) {
        best = left;
        direction = 2;
      }

      cost[i * cols + j] = best;
      trace[i * cols + j] = direction;
    }
  }

  // Walk the trace back to collect the tolerated substitutions.
  const explanation: string[] = [];
  let i = rows - 1;
  let j = cols - 1;
  while (i > 0 && j > 0) {
    const direction = trace[i * cols + j];
    if (direction === 0) {
      const from = query[i - 1];
      const to = candidate[j - 1];
      if (from !== to && confusable.has(`${from}>${to}`)) {
        explanation.unshift(`${from}→${to} at position ${j}`);
      }
      i -= 1;
      j -= 1;
    } else if (direction === 1) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  const distance = cost[rows * cols - 1];
  const score = Math.max(0, 1 - distance / Math.max(query.length, candidate.length));
  return { score: Number(score.toFixed(4)), explanation };
}

/**
 * Expands a partial plate with `?` or `*` wildcards into a regex. Operators
 * routinely have only a fragment: "MH12??4471".
 */
export function wildcardToRegex(pattern: string): RegExp | null {
  if (!/[?*]/.test(pattern)) return null;
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\?/g, '[A-Z0-9]')
    .replace(/\*/g, '[A-Z0-9]*');
  try {
    return new RegExp(`^${escaped}$`);
  } catch {
    return null;
  }
}
