/**
 * 프롬프트 속 레퍼런스 언급(@image1, @img, [Image 2], @jacket …) 찾기·연결·정리.
 *
 * 다른 도구나 LLM에서 가져온 프롬프트는 언급 방식이 제각각이라(@img, @image1, @Image_2, 커스텀 이름),
 * 실제로 붙인 레퍼런스와 어긋나기 쉬워요. 여기서는
 *  1) 모든 언급을 찾고 → 2) 어떤 레퍼런스를 가리키는지 추정하거나 사용자가 연결하고
 *  3) 지금 모델이 알아듣는 형식(@Image1 / Image 1 / image 1)으로 한 번에 바꿔요.
 */

export type MentionKind = "image" | "video" | "audio";
/** at: @Image1 (Seedance) · word: Image 1 (MiniMax) · natural: image 1 (GPT Image·나노바나나·Seedream) */
export type MentionStyle = "at" | "word" | "natural";

export const MENTION_STYLE_LABEL: Record<MentionStyle, string> = {
  at: "@Image1",
  word: "Image 1",
  natural: "image 1",
};

export type Mention = {
  /** 원문 그대로 (예: "@img2", "[Image 1]", "@jacket") */
  raw: string;
  start: number;
  end: number;
  /** 같은 대상을 가리키는 언급끼리 묶는 키 */
  key: string;
  /** 접두어로 추정한 종류 (모르면 null) */
  kind: MentionKind | null;
  /** 숫자 (1부터) */
  index: number | null;
  /** 커스텀 이름 (예: jacket) */
  name: string | null;
  /** @ 로 시작하는 언급인지 (평문 "image 1"은 false) */
  explicit: boolean;
};

const KIND_WORDS: [RegExp, MentionKind][] = [
  [/^(image|img|pic|picture|photo|ref|reference|frame|이미지|사진|레퍼런스|참고|图|图片|圖|圖片|参考图)$/i, "image"],
  [/^(video|vid|clip|movie|영상|비디오|동영상|视频|視頻)$/i, "video"],
  [/^(audio|sound|music|voice|오디오|소리|음악|音频|音頻)$/i, "audio"],
];

function kindOf(word: string): MentionKind | null {
  for (const [re, k] of KIND_WORDS) if (re.test(word)) return k;
  return null;
}

const KIND_ALT =
  "image|img|pic|picture|photo|ref|reference|frame|video|vid|clip|movie|audio|sound|music|voice|이미지|사진|레퍼런스|참고|영상|비디오|동영상|오디오|소리|음악|图片|图|圖片|圖|参考图|视频|視頻|音频|音頻";

// @로 시작: @img2, @Image_1, @image-3, @jacket, @캐릭터A (이메일 주소는 제외)
const AT_RE = /(^|[^\p{L}\p{N}_@.])@([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu;
// 괄호: [Image 1], <image2>, {img 3}, 【图1】
const BRACKET_RE = new RegExp(`[\\[<{【]\\s*(${KIND_ALT})\\s*[_\\-#]?\\s*(\\d{1,2})\\s*[\\]>}】]`, "giu");
// 평문: Image 1, video 2, 图1, 이미지 2 (숫자가 붙어야 언급으로 봄)
const PLAIN_RE = new RegExp(`(^|[^\\p{L}\\p{N}@\\[<{【])(${KIND_ALT})\\s?#?(\\d{1,2})(?![\\p{L}\\p{N}])`, "giu");

function splitName(word: string): { kind: MentionKind | null; index: number | null; name: string | null } {
  // image1, img_2, Image-3, 이미지1, 图2
  const m = word.match(/^([\p{L}]+?)[_\-]?(\d{1,2})$/u);
  if (m) {
    const k = kindOf(m[1]);
    if (k) return { kind: k, index: Number(m[2]), name: null };
  }
  const k = kindOf(word);
  if (k) return { kind: k, index: null, name: null };
  return { kind: null, index: null, name: word };
}

// 한국어 조사가 붙은 언급 (@이미지1의, @민지가) → 조사는 언급에서 뺌
const KIND_NUM_PREFIX = new RegExp(`^(${KIND_ALT})[_\\-]?(\\d{1,2})`, "iu");
const PARTICLE = /(의|가|이|을|를|은|는|와|과|로|으로|에|에서|에게|도|만|처럼|같이|보다|랑|이랑|하고)$/u;

function trimParticle(word: string): string {
  const k = word.match(KIND_NUM_PREFIX);
  if (k && k[0].length < word.length && /^[\uac00-\ud7a3]+$/u.test(word.slice(k[0].length))) return k[0];
  if (/^[\uac00-\ud7a3]{2,}$/u.test(word)) {
    const p = word.match(PARTICLE);
    if (p && word.length - p[0].length >= 1) return word.slice(0, -p[0].length);
  }
  return word;
}

export function mentionKey(m: Pick<Mention, "kind" | "index" | "name">): string {
  if (m.name) return `name:${m.name.toLowerCase()}`;
  if (m.index !== null) return `${m.kind ?? "image"}#${m.index}`;
  return `${m.kind ?? "image"}#?`;
}

/** 프롬프트의 모든 언급 (위치 순) */
export function findMentions(text: string): Mention[] {
  const out: Mention[] = [];
  const taken: [number, number][] = [];
  const overlaps = (s: number, e: number) => taken.some(([a, b]) => s < b && e > a);
  const push = (m: Omit<Mention, "key">) => {
    if (overlaps(m.start, m.end)) return;
    taken.push([m.start, m.end]);
    out.push({ ...m, key: mentionKey(m) });
  };

  for (const m of text.matchAll(BRACKET_RE)) {
    const start = m.index!;
    push({ raw: m[0], start, end: start + m[0].length, kind: kindOf(m[1]), index: Number(m[2]), name: null, explicit: true });
  }
  for (const m of text.matchAll(AT_RE)) {
    const start = m.index! + m[1].length;
    const word = trimParticle(m[2]);
    const raw = `@${word}`;
    push({ raw, start, end: start + raw.length, ...splitName(word), explicit: true });
  }
  for (const m of text.matchAll(PLAIN_RE)) {
    const start = m.index! + m[1].length;
    const raw = m[0].slice(m[1].length);
    push({ raw, start, end: start + raw.length, kind: kindOf(m[2]), index: Number(m[3]), name: null, explicit: false });
  }
  return out.sort((a, b) => a.start - b.start);
}

/* --------------------------------- 연결 --------------------------------- */

export type RefItem = {
  id: string;
  kind: MentionKind;
  /** 종류 안에서의 순서 (1부터) — 모델에 보내는 순서 */
  order: number;
  filename: string;
  thumb: string;
};

export type LinkStatus = "linked" | "guessed" | "missing" | "ambiguous" | "unknown";

export type MentionGroup = {
  key: string;
  /** 대표 표기 (처음 나온 원문) */
  label: string;
  kind: MentionKind | null;
  mentions: Mention[];
  refId: string | null;
  status: LinkStatus;
  /** 사람이 읽는 설명 */
  reason: string;
};

const KIND_KO: Record<MentionKind, string> = { image: "이미지", video: "영상", audio: "오디오" };

function norm(s: string) {
  return s.toLowerCase().replace(/\.[a-z0-9]{2,5}$/, "").replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * 언급 묶음별로 어떤 레퍼런스를 가리키는지 정하기.
 * manual(사용자가 직접 연결) → 번호 → 종류가 하나뿐 → 파일명과 이름이 비슷함 순서.
 */
export function linkMentions(mentions: Mention[], refs: RefItem[], manual: Record<string, string | null> = {}): MentionGroup[] {
  const groups = new Map<string, Mention[]>();
  for (const m of mentions) groups.set(m.key, [...(groups.get(m.key) ?? []), m]);
  const byId = new Map(refs.map((r) => [r.id, r]));

  return [...groups.entries()].map(([key, list]) => {
    const first = list[0];
    const base = { key, label: first.raw, kind: first.kind, mentions: list };
    if (key in manual) {
      const id = manual[key];
      if (id === null) return { ...base, refId: null, status: "unknown" as const, reason: "연결하지 않음" };
      const ref = byId.get(id);
      if (ref) return { ...base, kind: ref.kind, refId: ref.id, status: "linked" as const, reason: "직접 연결함" };
    }
    if (first.index !== null) {
      const kind = first.kind ?? "image";
      const ref = refs.find((r) => r.kind === kind && r.order === first.index);
      if (ref) return { ...base, refId: ref.id, status: "linked" as const, reason: `${KIND_KO[kind]} ${first.index}번` };
      const count = refs.filter((r) => r.kind === kind).length;
      return {
        ...base,
        refId: null,
        status: "missing" as const,
        reason: count ? `${KIND_KO[kind]}가 ${count}개뿐이에요` : `${KIND_KO[kind]} 레퍼런스가 없어요`,
      };
    }
    if (first.name === null) {
      const kind = first.kind ?? "image";
      const same = refs.filter((r) => r.kind === kind);
      if (same.length === 1) return { ...base, refId: same[0].id, status: "guessed" as const, reason: `${KIND_KO[kind]}가 하나뿐이라 연결했어요` };
      return { ...base, refId: null, status: same.length ? ("ambiguous" as const) : ("missing" as const), reason: same.length ? "몇 번인지 골라 주세요" : `${KIND_KO[kind]} 레퍼런스가 없어요` };
    }
    // 커스텀 이름: 파일명과 비슷하면 추정
    const n = norm(first.name);
    const hit = n.length >= 2 ? refs.find((r) => norm(r.filename).includes(n) || (norm(r.filename).length >= 3 && n.includes(norm(r.filename)))) : undefined;
    if (hit) return { ...base, kind: hit.kind, refId: hit.id, status: "guessed" as const, reason: `파일명(${hit.filename})과 비슷해요` };
    return { ...base, refId: null, status: "unknown" as const, reason: "어떤 레퍼런스인지 골라 주세요" };
  });
}

/* --------------------------------- 정리 --------------------------------- */

const CAP: Record<MentionKind, string> = { image: "Image", video: "Video", audio: "Audio" };

export function formatMention(kind: MentionKind, order: number, style: MentionStyle): string {
  if (style === "at") return `@${CAP[kind]}${order}`;
  if (style === "word") return `${CAP[kind]} ${order}`;
  return `${kind} ${order}`;
}

/** 연결된 언급을 모두 모델 형식으로 바꾸기. 연결 안 된 언급은 그대로 둠 */
export function normalizeMentions(text: string, groups: MentionGroup[], refs: RefItem[], style: MentionStyle): { text: string; changed: number } {
  const byId = new Map(refs.map((r) => [r.id, r]));
  const edits: { start: number; end: number; to: string }[] = [];
  for (const g of groups) {
    const ref = g.refId ? byId.get(g.refId) : null;
    if (!ref) continue;
    const to = formatMention(ref.kind, ref.order, style);
    for (const m of g.mentions) if (m.raw !== to) edits.push({ start: m.start, end: m.end, to });
  }
  return { text: applyEdits(text, edits), changed: edits.length };
}

/** 한 묶음의 언급을 모두 다른 글로 바꾸기 (이름 바꾸기) */
export function renameGroup(text: string, group: MentionGroup, to: string): string {
  return applyEdits(
    text,
    group.mentions.map((m) => ({ start: m.start, end: m.end, to })),
  );
}

function applyEdits(text: string, edits: { start: number; end: number; to: string }[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.to + out.slice(e.end);
  return out;
}

/** 처음 언급된 순서대로 레퍼런스 순서를 바꾸면 (종류별) — 언급 안 된 것은 뒤로 */
export function orderByMentions<T extends { id: string }>(items: T[], groups: MentionGroup[], mentions: Mention[]): T[] {
  const firstPos = new Map<string, number>();
  for (const g of groups) if (g.refId) firstPos.set(g.refId, Math.min(firstPos.get(g.refId) ?? Infinity, ...g.mentions.map((m) => m.start)));
  const mentioned = items.filter((i) => firstPos.has(i.id)).sort((a, b) => firstPos.get(a.id)! - firstPos.get(b.id)!);
  void mentions;
  return [...mentioned, ...items.filter((i) => !firstPos.has(i.id))];
}

export function mentionIssues(groups: MentionGroup[]): number {
  return groups.filter((g) => g.status === "missing" || g.status === "ambiguous" || g.status === "unknown").length;
}
