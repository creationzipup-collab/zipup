/**
 * 컷 이름 규칙 (서버·브라우저 공용)
 * - 컷은 작업을 나누는 작은 단위예요 (시퀀스·씬이어도 돼요). 이름은 자유롭게: 한글·띄어쓰기·대소문자를 그대로 둬요
 * - 파일 이름에 못 쓰는 문자만 빼고, 같은 프로젝트 안에서는 같은 이름을 못 써요 (대소문자 무시)
 * - 새로 만들 때 추천 이름: 마지막 이름이 숫자로 끝나면(S02_C05) 다음 번호(S02_C06), 없으면 C001부터
 */

export const CUT_NAME_MAX = 40;

const TAIL = /^(.*?)(\d+)$/;

export function normalizeCutName(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CUT_NAME_MAX)
    .trim();
}

/** 같은 이름인지 (대소문자·공백 차이 무시) */
export function sameCutName(a: string, b: string): boolean {
  return normalizeCutName(a).toLowerCase() === normalizeCutName(b).toLowerCase();
}

/** 영문·숫자·기호로만 된 이름(C001, S02_C05)은 고정폭 글꼴로 보여요 */
export function isCodeLike(name: string | null | undefined): boolean {
  return !!name && /^[\x21-\x7e]+$/.test(name);
}

/** 이어지는 추천 이름 n개. existing은 프로젝트의 컷 이름들 (순서대로) */
export function nextCutCodes(existing: string[], count = 1): string[] {
  const taken = new Set(existing.map((c) => c.toLowerCase()));
  const last = [...existing].reverse().find((c) => TAIL.test(c));
  let prefix = "C";
  let width = 3;
  let n = 0;
  if (last) {
    const m = last.match(TAIL)!;
    prefix = m[1];
    width = m[2].length;
    n = Number(m[2]);
  }
  const out: string[] = [];
  while (out.length < count) {
    n += 1;
    const code = `${prefix}${String(n).padStart(width, "0")}`;
    if (!taken.has(code.toLowerCase())) {
      out.push(code);
      taken.add(code.toLowerCase());
    }
  }
  return out;
}

/**
 * 시작 이름부터 n개 (여러 개 한 번에 만들 때).
 * 숫자로 끝나면 그 번호를 이어서(SEQ_08 → SEQ_09), 아니면 뒤에 2, 3 …을 붙여요(오프닝 → 오프닝 2).
 */
export function cutSeries(start: string, count: number, existing: string[] = []): string[] {
  const first = normalizeCutName(start);
  if (!first) return nextCutCodes(existing, count);
  const taken = new Set(existing.map((c) => c.toLowerCase()));
  const out = [first];
  taken.add(first.toLowerCase());
  const m = first.match(TAIL);
  let n = m ? Number(m[2]) : 1;
  while (out.length < count) {
    n += 1;
    const name = m ? `${m[1]}${String(n).padStart(m[2].length, "0")}` : `${first} ${n}`;
    if (!taken.has(name.toLowerCase())) {
      out.push(name);
      taken.add(name.toLowerCase());
    }
  }
  return out;
}

/** 너비·높이 → 파일명용 비율 (자주 쓰는 비율만, 아니면 빈 값) */
export function ratioLabel(width?: number | null, height?: number | null): string | null {
  if (!width || !height) return null;
  const r = width / height;
  const common: [string, number][] = [
    ["21:9", 21 / 9],
    ["16:9", 16 / 9],
    ["3:2", 3 / 2],
    ["4:3", 4 / 3],
    ["5:4", 5 / 4],
    ["1:1", 1],
    ["4:5", 4 / 5],
    ["3:4", 3 / 4],
    ["2:3", 2 / 3],
    ["9:16", 9 / 16],
  ];
  const hit = common.find(([, v]) => Math.abs(v - r) < 0.02);
  return hit ? hit[0] : null;
}
