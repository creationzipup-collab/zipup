/**
 * 문장(구) 단위 변경 비교 — "어느 부분이 바뀌었고, 원래 뜻 → 바뀐 뜻"을 보여주기 위해.
 * 한국어 대조 번역의 구간을 단위로 쓰고, 번역이 없으면(한국어 프롬프트 등) 쉼표·마침표로 나눠요.
 */
import { diffWords, tokenize, type DiffOp } from "@/lib/prompt/diff";

export type Unit = { text: string; ko: string | null };

export type SegmentChange =
  | { type: "same"; before: Unit; after: Unit }
  | { type: "changed"; before: Unit; after: Unit; ops: DiffOp[] }
  | { type: "added"; after: Unit }
  | { type: "removed"; before: Unit };

/** 번역 구간이 없을 때: 쉼표·마침표·줄바꿈으로 구 나누기 */
export function splitClauses(text: string): Unit[] {
  return text
    .split(/(?<=[.!?。！？])\s+|\n+|,\s*|，|;\s*/u)
    .map((t) => t.trim())
    .filter((t) => /[\p{L}\p{N}]/u.test(t))
    .map((t) => ({ text: t, ko: null }));
}

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/[\s.,;:!?。，！？]+$/u, "").trim();
}

function words(s: string): number {
  return tokenize(s).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

/** 0~1: 공통 단어 비율 */
export function similarity(a: string, b: string): number {
  const total = words(a) + words(b);
  if (!total) return 0;
  const common = diffWords(norm(a), norm(b))
    .filter((op) => op.type === "equal")
    .reduce((n, op) => n + words(op.text), 0);
  return (2 * common) / total;
}

/** 같은 구간끼리의 최장 공통 부분열 (구간 단위) */
function lcsPairs(a: string[], b: string[]): [number, number][] {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return out;
}

const MIN_SIM = 0.34;

export function diffSegments(before: Unit[], after: Unit[]): SegmentChange[] {
  const A = before.map((u) => norm(u.text));
  const B = after.map((u) => norm(u.text));
  const anchors = lcsPairs(A, B);
  const out: SegmentChange[] = [];

  // 앵커 사이의 구간: 비슷한 것끼리 짝 → 바뀜, 남은 것 → 추가·삭제
  const flush = (a0: number, a1: number, b0: number, b1: number) => {
    const olds = Array.from({ length: a1 - a0 }, (_, k) => a0 + k);
    const news = Array.from({ length: b1 - b0 }, (_, k) => b0 + k);
    const pairs: { i: number; j: number; s: number }[] = [];
    for (const i of olds) for (const j of news) {
      const s = similarity(before[i].text, after[j].text);
      if (s >= MIN_SIM) pairs.push({ i, j, s });
    }
    pairs.sort((x, y) => y.s - x.s);
    const oldOf = new Map<number, number>();
    const usedOld = new Set<number>();
    for (const p of pairs) {
      if (usedOld.has(p.i) || oldOf.has(p.j)) continue;
      usedOld.add(p.i);
      oldOf.set(p.j, p.i);
    }
    // 같은 자리에서 통째로 바뀐 구간(heavy fog → light mist)도 "바뀜"으로: 남은 것끼리 순서대로 짝
    const restOld = olds.filter((i) => !usedOld.has(i));
    const restNew = news.filter((j) => !oldOf.has(j));
    for (let k = 0; k < Math.min(restOld.length, restNew.length); k++) {
      // 앞뒤 짝과 순서가 엇갈리지 않을 때만
      const i = restOld[k];
      const j = restNew[k];
      const crosses = [...oldOf.entries()].some(([pj, pi]) => (pj < j && pi > i) || (pj > j && pi < i));
      if (crosses) continue;
      usedOld.add(i);
      oldOf.set(j, i);
    }
    let nextOld = a0;
    const emitRemovedBefore = (limit: number) => {
      for (; nextOld < limit; nextOld++) if (!usedOld.has(nextOld)) out.push({ type: "removed", before: before[nextOld] });
    };
    // 추가된 구간 앞에는, 다음 짝 이전에 빠진 구간을 먼저 (− 다음 +)
    const nextPaired = new Map<number, number>();
    let upcoming = a1;
    for (let k = news.length - 1; k >= 0; k--) {
      const i = oldOf.get(news[k]);
      if (i !== undefined) upcoming = i;
      nextPaired.set(news[k], upcoming);
    }
    for (const j of news) {
      const i = oldOf.get(j);
      if (i === undefined) {
        emitRemovedBefore(nextPaired.get(j) ?? a1);
        out.push({ type: "added", after: after[j] });
        continue;
      }
      emitRemovedBefore(i);
      nextOld = Math.max(nextOld, i + 1);
      out.push({ type: "changed", before: before[i], after: after[j], ops: diffWords(before[i].text, after[j].text) });
    }
    emitRemovedBefore(a1);
  };

  let pa = 0;
  let pb = 0;
  for (const [i, j] of anchors) {
    flush(pa, i, pb, j);
    out.push({ type: "same", before: before[i], after: after[j] });
    pa = i + 1;
    pb = j + 1;
  }
  flush(pa, before.length, pb, after.length);
  return out;
}
