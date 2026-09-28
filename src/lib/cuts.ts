/**
 * 컷 번호 규칙 (서버·브라우저 공용)
 * - 기본은 C001, C002 … (세 자리)
 * - 마지막 컷이 S02_C05처럼 끝에 숫자가 있으면 그 모양을 이어서 S02_C06
 */

const TAIL = /^(.*?)(\d+)$/;

export function normalizeCutCode(raw: string): string {
  return raw
    .normalize("NFC")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[\\/:*?"<>|]+/g, "")
    .slice(0, 24);
}

/** 이어지는 컷 번호 n개. existing은 프로젝트의 컷 번호들 (순서대로) */
export function nextCutCodes(existing: string[], count = 1): string[] {
  const taken = new Set(existing.map((c) => c.toUpperCase()));
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
    if (!taken.has(code.toUpperCase())) {
      out.push(code);
      taken.add(code.toUpperCase());
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
