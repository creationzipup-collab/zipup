/**
 * LLM이 돌려준 구간(src/dst)을 원문 위치(start/end)에 맞추기.
 * - 모델이 공백·대소문자를 조금 바꿔도 찾을 수 있게 느슨하게 매칭
 * - 번역이 빠진 원문 조각은 dst가 빈 구간으로 채워 넣어 UI에서 표시
 */
export type Segment = { src: string; dst: string; start: number; end: number };

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findLoose(text: string, needle: string, from: number): { index: number; length: number } | null {
  const exact = text.indexOf(needle, from);
  if (exact >= 0) return { index: exact, length: needle.length };
  const lower = text.toLowerCase().indexOf(needle.toLowerCase(), from);
  if (lower >= 0) return { index: lower, length: needle.length };
  // 공백 차이 무시
  const words = needle.split(/\s+/).filter(Boolean).map(escapeRe);
  if (!words.length) return null;
  const re = new RegExp(words.join("\\s+"), "giu");
  re.lastIndex = from;
  const m = re.exec(text);
  return m ? { index: m.index, length: m[0].length } : null;
}

export function alignSegments(text: string, raw: { src: string; dst: string }[]): Segment[] {
  const out: Segment[] = [];
  let cursor = 0;
  for (const seg of raw) {
    const needle = (seg.src ?? "").trim();
    if (!needle) continue;
    const hit = findLoose(text, needle, cursor);
    if (!hit) {
      // 못 찾은 조각의 번역은 앞 구간에 덧붙임
      if (out.length && seg.dst) out[out.length - 1].dst = `${out[out.length - 1].dst} ${seg.dst}`.trim();
      continue;
    }
    // 앞에 번역되지 않은 글자(문장부호·공백 제외)가 남았으면 빈 구간으로 표시
    const gap = text.slice(cursor, hit.index);
    if (/[\p{L}\p{N}]/u.test(gap)) {
      const lead = gap.length - gap.trimStart().length;
      const t = gap.trim();
      out.push({ src: t, dst: "", start: cursor + lead, end: cursor + lead + t.length });
    }
    out.push({ src: text.slice(hit.index, hit.index + hit.length), dst: (seg.dst ?? "").trim(), start: hit.index, end: hit.index + hit.length });
    cursor = hit.index + hit.length;
  }
  const rest = text.slice(cursor);
  if (/[\p{L}\p{N}]/u.test(rest)) {
    const lead = rest.length - rest.trimStart().length;
    const t = rest.trim();
    out.push({ src: t, dst: "", start: cursor + lead, end: cursor + lead + t.length });
  }
  return out;
}

/** 번역된 비율 (0~1) — 낮으면 캐시하지 않음 */
export function coverage(text: string, segs: Segment[]): number {
  const letters = (s: string) => (s.match(/[\p{L}\p{N}]/gu) ?? []).length;
  const total = letters(text);
  if (!total) return 1;
  const covered = segs.filter((s) => s.dst).reduce((n, s) => n + letters(s.src), 0);
  return covered / total;
}

/** 쉼표·문장부호 기준으로 나누기 (모의 번역·빠른 미리보기용) */
export function splitPhrases(text: string): { src: string }[] {
  return (text.match(/[^,.;:!?，。；：！？\n]+[,.;:!?，。；：！？]?/g) ?? []).map((p) => ({ src: p.trim() })).filter((p) => p.src);
}

/** 모델 응답에서 JSON 객체만 꺼내기 (코드 펜스·앞뒤 설명 무시) */
export function parseJsonLoose<T>(text: string): T | null {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/** 구간 하나를 새 문구로 바꾸고, 뒤 구간 위치를 보정 */
export function replaceSegment(text: string, segs: Segment[], index: number, replacement: string, dst?: string): { text: string; segments: Segment[] } {
  const seg = segs[index];
  if (!seg) return { text, segments: segs };
  const next = text.slice(0, seg.start) + replacement + text.slice(seg.end);
  const delta = replacement.length - (seg.end - seg.start);
  const segments = segs.map((s, i) => {
    if (i < index) return s;
    if (i === index) return { src: replacement, dst: dst ?? s.dst, start: s.start, end: s.start + replacement.length };
    return { ...s, start: s.start + delta, end: s.end + delta };
  });
  return { text: next, segments };
}
