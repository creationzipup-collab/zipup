import { MODELS } from "@/lib/models/registry";
import type { AssetKind, AssetSource, ColorLabel } from "@/lib/types";

import { expandTerm } from "./synonyms";

/**
 * 고급 검색 문법 (라이브러리 검색창)
 *
 *   네온 도시                  → 두 단어 모두 포함 (한·영 동의어 자동 확장)
 *   "red dress"               → 정확한 구문
 *   -blur                     → 제외
 *   #인물  tag:인물           → 태그
 *   @홍길동  by:홍길동         → 만든 사람
 *   model:seedream  모델:나노바나나
 *   project:신제품  프로젝트:신제품
 *   team:기획팀  팀:기획팀
 *   is:video  is:image  is:upload  is:ok  is:ng  is:keep  is:fav  is:unrated
 *   cut:C003  컷:C003
 *   rating>=4  ★4  별점:5
 *   color:red  색:빨강
 *   ratio:16:9  비율:9:16
 *   date:today  date:week  date:month  after:2026-09-01  before:2026-09-30
 */
export type ParsedQuery = {
  terms: string[][];
  phrases: string[];
  excludes: string[];
  models: string[];
  tags: string[];
  projects: string[];
  users: string[];
  teams: string[];
  kind?: AssetKind;
  source?: AssetSource;
  minRating?: number;
  exactRating?: number;
  flags: ("pick" | "reject" | "keep" | "none")[];
  /** 컷 이름 */
  cuts: string[];
  colors: ColorLabel[];
  favorite?: boolean;
  unrated?: boolean;
  ratio?: string;
  after?: Date;
  before?: Date;
};

const KEY_ALIASES: Record<string, string> = {
  model: "model",
  모델: "model",
  tag: "tag",
  태그: "tag",
  project: "project",
  프로젝트: "project",
  by: "user",
  user: "user",
  작성자: "user",
  만든사람: "user",
  team: "team",
  팀: "team",
  cut: "cut",
  컷: "cut",
  shot: "cut",
  is: "is",
  상태: "is",
  종류: "is",
  rating: "rating",
  별점: "rating",
  color: "color",
  색: "color",
  색상: "color",
  ratio: "ratio",
  비율: "ratio",
  date: "date",
  날짜: "date",
  after: "after",
  이후: "after",
  before: "before",
  이전: "before",
};

const COLOR_ALIASES: Record<string, ColorLabel> = {
  red: "red",
  빨강: "red",
  빨간: "red",
  orange: "orange",
  주황: "orange",
  yellow: "yellow",
  노랑: "yellow",
  노란: "yellow",
  green: "green",
  초록: "green",
  녹색: "green",
  blue: "blue",
  파랑: "blue",
  파란: "blue",
  purple: "purple",
  보라: "purple",
};

const MODEL_ALIASES: Record<string, string[]> = {
  "seedream-5-pro": ["seedream", "시드림", "씨드림", "seedream5"],
  "nano-banana-pro": ["nano-banana-pro", "nanobananapro", "나노바나나프로", "나노바나나pro", "nbpro"],
  "nano-banana-2": ["nano-banana-2", "nanobanana2", "나노바나나2", "nb2"],
  "gpt-image-2-5": ["gpt2.5", "gpt25", "gptimage2.5", "gpt-image-2.5", "지피티2.5", "flare", "sunburst"],
  "gpt-image-2": ["gpt2", "gpt2.0", "gptimage2", "gpt-image-2", "지피티2"],
  "minimax-h3": ["h3", "minimax", "hailuo", "하이루오", "미니맥스"],
  "seedance-2-5": ["seedance", "시댄스", "씨댄스", "seedance2.5"],
};

export function resolveModelAlias(value: string): string[] {
  const v = value.toLowerCase().replace(/\s+/g, "");
  const hits = new Set<string>();
  for (const m of MODELS) {
    const names = [m.id, m.name.toLowerCase().replace(/\s+/g, ""), ...(MODEL_ALIASES[m.id] ?? [])];
    if (names.some((n) => n === v || n.includes(v) || (v.length >= 3 && v.includes(n)))) hits.add(m.id);
  }
  // "나노바나나" / "gpt" 처럼 포괄적인 이름은 여러 모델에 매칭
  if (v === "나노바나나" || v === "nanobanana" || v === "nano-banana") {
    hits.add("nano-banana-pro");
    hits.add("nano-banana-2");
  }
  if (v === "gpt" || v === "지피티" || v === "gptimage") {
    hits.add("gpt-image-2-5");
    hits.add("gpt-image-2");
  }
  return Array.from(hits);
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const re = /(-?)(?:([\p{L}\p{N}_]+)(:|>=|<=|>|=)("([^"]*)"|\S+)|"([^"]*)"|(\S+))/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) tokens.push(m[0]);
  return tokens;
}

function parseDateToken(v: string, now: Date): { after?: Date; before?: Date } {
  const kstNow = new Date(now.getTime() + 9 * 3600_000);
  const day = (offset: number) =>
    new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate() + offset) - 9 * 3600_000);
  switch (v) {
    case "today":
    case "오늘":
      return { after: day(0) };
    case "yesterday":
    case "어제":
      return { after: day(-1), before: day(0) };
    case "week":
    case "이번주":
    case "7d":
      return { after: day(-6) };
    case "month":
    case "이번달":
    case "30d":
      return { after: day(-29) };
  }
  const range = v.split("..");
  if (range.length === 2) {
    const a = toDate(range[0]);
    const b = toDate(range[1]);
    return { after: a, before: b ? new Date(b.getTime() + 24 * 3600_000) : undefined };
  }
  const d = toDate(v);
  return d ? { after: d, before: new Date(d.getTime() + 24 * 3600_000) } : {};
}

function toDate(v: string): Date | undefined {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(v);
  if (!m) return undefined;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - 9 * 3600_000);
}

function unquote(v: string): string {
  return v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;
}

export function parseQuery(input: string, now = new Date()): ParsedQuery {
  const q: ParsedQuery = {
    terms: [],
    phrases: [],
    excludes: [],
    models: [],
    tags: [],
    projects: [],
    users: [],
    teams: [],
    flags: [],
    cuts: [],
    colors: [],
  };
  const text = input.replace(/★\s*(\d)/g, "rating>=$1");
  for (const raw of tokenize(text)) {
    const negative = raw.startsWith("-") && raw.length > 1;
    const token = negative ? raw.slice(1) : raw;

    const kv = /^([\p{L}\p{N}_]+)(:|>=|<=|>|=)(.+)$/u.exec(token);
    if (kv && KEY_ALIASES[kv[1].toLowerCase()]) {
      const key = KEY_ALIASES[kv[1].toLowerCase()];
      const op = kv[2];
      const value = unquote(kv[3]).trim();
      if (!value) continue;
      switch (key) {
        case "model":
          q.models.push(...resolveModelAlias(value));
          break;
        case "tag":
          q.tags.push(value.replace(/^#/, "").toLowerCase());
          break;
        case "project":
          q.projects.push(value);
          break;
        case "user":
          q.users.push(value.replace(/^@/, ""));
          break;
        case "team":
          q.teams.push(value);
          break;
        case "cut":
          q.cuts.push(value.replace(/\s+/g, " ").trim().toUpperCase());
          break;
        case "rating": {
          const n = Number(value.replace("+", ""));
          if (Number.isFinite(n)) {
            if (op === ">=" || op === ">" || value.endsWith("+")) q.minRating = Math.min(5, op === ">" ? n + 1 : n);
            else if (op === "=" || n === 5 || n === 0) q.exactRating = n;
            else q.minRating = n;
          }
          break;
        }
        case "color": {
          const c = COLOR_ALIASES[value.toLowerCase()];
          if (c) q.colors.push(c);
          break;
        }
        case "ratio":
          q.ratio = value;
          break;
        case "date":
          Object.assign(q, parseDateToken(value.toLowerCase(), now));
          break;
        case "after": {
          const d = toDate(value);
          if (d) q.after = d;
          break;
        }
        case "before": {
          const d = toDate(value);
          if (d) q.before = new Date(d.getTime() + 24 * 3600_000);
          break;
        }
        case "is": {
          const v = value.toLowerCase();
          if (["video", "영상", "동영상"].includes(v)) q.kind = "video";
          else if (["image", "이미지", "사진"].includes(v)) q.kind = "image";
          else if (["upload", "업로드"].includes(v)) q.source = "upload";
          else if (["generated", "생성"].includes(v)) q.source = "generated";
          else if (["ok", "pick", "픽", "셀렉", "채택", "오케이"].includes(v)) q.flags.push("pick");
          else if (["ng", "reject", "탈락", "리젝", "엔지"].includes(v)) q.flags.push("reject");
          else if (["keep", "킵", "보류"].includes(v)) q.flags.push("keep");
          else if (["unflagged", "미분류"].includes(v)) q.flags.push("none");
          else if (["fav", "favorite", "즐겨찾기", "좋아요"].includes(v)) q.favorite = true;
          else if (["unrated", "별점없음"].includes(v)) q.unrated = true;
          break;
        }
      }
      continue;
    }

    if (token.startsWith("#") && token.length > 1) {
      q.tags.push(token.slice(1).toLowerCase());
      continue;
    }
    if (token.startsWith("@") && token.length > 1) {
      q.users.push(token.slice(1));
      continue;
    }
    if (token.startsWith('"') && token.endsWith('"') && token.length > 2) {
      const phrase = token.slice(1, -1).toLowerCase().trim();
      if (phrase) (negative ? q.excludes : q.phrases).push(phrase);
      continue;
    }
    const word = token.toLowerCase().trim();
    if (!word) continue;
    if (negative) q.excludes.push(word);
    else q.terms.push(expandTerm(word));
  }
  q.models = Array.from(new Set(q.models));
  q.tags = Array.from(new Set(q.tags));
  return q;
}

export function isEmptyQuery(q: ParsedQuery): boolean {
  return (
    !q.terms.length &&
    !q.phrases.length &&
    !q.excludes.length &&
    !q.models.length &&
    !q.tags.length &&
    !q.projects.length &&
    !q.users.length &&
    !q.teams.length &&
    !q.cuts.length &&
    !q.kind &&
    !q.source &&
    q.minRating === undefined &&
    q.exactRating === undefined &&
    !q.flags.length &&
    !q.colors.length &&
    !q.favorite &&
    !q.unrated &&
    !q.ratio &&
    !q.after &&
    !q.before
  );
}

/** 검색 문법 도움말 (UI용) */
export const SEARCH_HELP: { syntax: string; desc: string }[] = [
  { syntax: "네온 도시", desc: "모든 단어 포함 · 한/영 동의어 자동 확장" },
  { syntax: '"red dress"', desc: "정확한 구문" },
  { syntax: "-흐림", desc: "제외할 단어" },
  { syntax: "#인물", desc: "태그" },
  { syntax: "@홍길동", desc: "만든 사람 (@나 = 내 것)" },
  { syntax: "model:seedream", desc: "모델 (시드림, 나노바나나, gpt, h3, 시댄스)" },
  { syntax: "project:신제품", desc: "프로젝트 이름" },
  { syntax: "is:video · is:ok · is:ng · is:keep", desc: "영상 / OK / NG / KEEP" },
  { syntax: 'cut:C003 · cut:"오프닝 시퀀스"', desc: "컷 이름" },
  { syntax: "★4  또는  rating>=4", desc: "별점 4점 이상" },
  { syntax: "color:red", desc: "컬러 라벨" },
  { syntax: "date:week · after:2026-09-01", desc: "기간" },
  { syntax: "ratio:9:16", desc: "비율" },
];
