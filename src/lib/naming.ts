/**
 * 자동 파일명 규칙
 * 사용 가능한 토큰: {project} {cut} {take} {team} {user} {model} {kind} {date} {time} {seq} {prompt} {ratio} {res} {index}
 * 예) "{project}_{model}_{date}_{seq}" → "신제품런칭_seedream5pro_20260928_0012.png"
 * 컷에 들어간 클립은 규칙에 {cut}이 없어도 프로젝트 이름 뒤에 컷·테이크가 붙어요 → "신제품런칭_C003_T07_…"
 */
export const FILENAME_TOKENS: { token: string; label: string; example: string }[] = [
  { token: "{project}", label: "프로젝트 이름", example: "신제품런칭" },
  { token: "{cut}", label: "컷 이름", example: "C003" },
  { token: "{take}", label: "테이크", example: "T07" },
  { token: "{team}", label: "팀 이름", example: "AI제작팀" },
  { token: "{user}", label: "만든 사람", example: "홍길동" },
  { token: "{model}", label: "모델", example: "seedream5pro" },
  { token: "{kind}", label: "종류", example: "img" },
  { token: "{date}", label: "날짜 (YYYYMMDD)", example: "20260928" },
  { token: "{time}", label: "시각 (HHmmss)", example: "143015" },
  { token: "{seq}", label: "프로젝트 순번 (0001)", example: "0012" },
  { token: "{prompt}", label: "프롬프트 핵심어 3개", example: "neon-city-night" },
  { token: "{ratio}", label: "비율", example: "16x9" },
  { token: "{res}", label: "해상도", example: "2K" },
  { token: "{index}", label: "배치 내 번호", example: "1" },
];

export type NameContext = {
  project: string;
  /** 컷 이름 (컷에 들어간 클립만) */
  cut?: string | null;
  take?: number | null;
  team?: string | null;
  user: string;
  model: string;
  kind: "image" | "video";
  date: Date;
  seq: number;
  prompt: string;
  ratio?: string | null;
  res?: string | null;
  index?: number;
  ext: string;
};

const STOPWORDS = new Set(
  (
    "a an the of in on at to for from by with and or but is are was were be been very highly ultra super " +
    "detailed detail realistic photorealistic hyperrealistic quality high best masterpiece 4k 8k hd uhd " +
    "image photo picture style render rendering shot please make create generate showing featuring into " +
    "그리고 매우 아주 정말 이미지 사진 그림 스타일 고화질 고퀄리티 생성 만들어 만들어줘 해줘 주세요 느낌"
  ).split(/\s+/),
);

const KO_PARTICLE = /(에서|으로|에게|까지|부터|처럼|하고|이랑|랑|와|과|은|는|이|가|을|를|의|에|로|도|만)$/;

export function promptKeywords(prompt: string, max = 3): string[] {
  const words = prompt
    .toLowerCase()
    .replace(/<<<[^>]*>>>/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .map((w) => (/[가-힣]/.test(w) && w.length > 2 ? w.replace(KO_PARTICLE, "") : w))
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  const out: string[] = [];
  for (const w of words) {
    if (!out.includes(w)) out.push(w);
    if (out.length >= max) break;
  }
  return out;
}

function kst(date: Date) {
  const d = new Date(date.getTime() + 9 * 3600_000);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return {
    date: `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`,
    time: `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`,
  };
}

export function sanitizeSegment(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");
}

export function renderFilename(template: string, ctx: NameContext): string {
  const { date, time } = kst(ctx.date);
  const values: Record<string, string> = {
    project: ctx.project,
    cut: ctx.cut ?? "",
    take: ctx.take ? formatTake(ctx.take) : "",
    team: ctx.team ?? "",
    user: ctx.user,
    model: ctx.model,
    kind: ctx.kind === "video" ? "vid" : "img",
    date,
    time,
    seq: String(ctx.seq).padStart(4, "0"),
    prompt: promptKeywords(ctx.prompt).join("-"),
    ratio: (ctx.ratio ?? "").replace(":", "x"),
    res: ctx.res ?? "",
    index: String((ctx.index ?? 0) + 1),
  };
  let base = withCutTokens(template || "{project}_{model}_{date}_{seq}", !!ctx.cut).replace(/\{(\w+)\}/g, (_, k: string) =>
    k in values ? sanitizeSegment(values[k]) : "",
  );
  base = base
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/_{2,}/g, "_")
    .replace(/-{2,}/g, "-")
    .replace(/(^[_\-.]+)|([_\-.]+$)/g, "");
  if (!base) base = `zipup_${date}_${values.seq}`;
  if (base.length > 120) base = base.slice(0, 120).replace(/[_\-.]+$/, "");
  return `${base}.${ctx.ext.replace(/^\./, "")}`;
}

/** 테이크 표기 T01, T12, T123 */
export function formatTake(take: number): string {
  return `T${String(take).padStart(2, "0")}`;
}

/** 컷에 들어간 클립인데 규칙에 {cut}이 없으면 프로젝트 이름 뒤(없으면 맨 앞)에 컷·테이크를 넣어요 */
export function withCutTokens(template: string, inCut: boolean): string {
  if (!inCut || template.includes("{cut}")) return template;
  const cutPart = template.includes("{take}") ? "{cut}" : "{cut}_{take}";
  return template.includes("{project}") ? template.replace("{project}", `{project}_${cutPart}`) : `${cutPart}_${template}`;
}

/** 내보낼 때: 파일 이름 끝에 판정(OK·NG·KEEP)을 붙임 */
export function withVerdict(filename: string, verdict: string | null | undefined): string {
  if (!verdict) return filename;
  const m = filename.match(/^(.*?)(\.[^.]+)?$/);
  const base = m?.[1] ?? filename;
  const ext = m?.[2] ?? "";
  return `${base}_${verdict}${ext}`;
}
