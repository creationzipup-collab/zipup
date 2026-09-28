/**
 * 프롬프트 버전 비교용 단어 단위 diff (Myers 알고리즘)
 * - 영어·한국어: 단어(띄어쓰기) 단위
 * - 중국어·일본어 한자: 글자 단위 (띄어쓰기가 없으므로)
 */
export type DiffOp = { type: "equal" | "insert" | "delete"; text: string };

const TOKEN = /\s+|\p{Script=Han}|[\p{L}\p{N}_'’\-]+|[^\s\p{L}\p{N}]/gu;

export function tokenize(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

/** a → b 로 바뀐 부분 (토큰 단위, 연속된 같은 종류는 합침) */
export function diffWords(a: string, b: string): DiffOp[] {
  const A = tokenize(a);
  const B = tokenize(b);
  const ops = myers(A, B);
  // 공백만 바뀐 경우 등으로 조각나지 않게 합치기
  const merged: DiffOp[] = [];
  for (const op of ops) {
    const last = merged[merged.length - 1];
    if (last && last.type === op.type) last.text += op.text;
    else merged.push({ ...op });
  }
  return merged;
}

/** 추가·삭제된 단어 수 (공백 제외) */
export function diffStats(ops: DiffOp[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const op of ops) {
    if (op.type === "equal") continue;
    const n = tokenize(op.text).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
    if (op.type === "insert") added += n;
    else removed += n;
  }
  return { added, removed };
}

function myers(a: string[], b: string[]): DiffOp[] {
  // 앞뒤 공통 부분은 미리 잘라서 계산량을 줄임
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const head: DiffOp[] = start ? [{ type: "equal", text: a.slice(0, start).join("") }] : [];
  const tail: DiffOp[] = endA < a.length ? [{ type: "equal", text: a.slice(endA).join("") }] : [];
  const A = a.slice(start, endA);
  const B = b.slice(start, endB);
  if (!A.length && !B.length) return [...head, ...tail];
  if (!A.length) return [...head, { type: "insert", text: B.join("") }, ...tail];
  if (!B.length) return [...head, { type: "delete", text: A.join("") }, ...tail];

  const n = A.length;
  const m = B.length;
  const max = n + m;
  const offset = max;
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];
  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) x = v[offset + k + 1];
      else x = v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && A[x] === B[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }

  // 역추적
  const out: DiffOp[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vv = trace[d];
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && vv[offset + k - 1] < vv[offset + k + 1])) prevK = k + 1;
    else prevK = k - 1;
    const prevX = vv[offset + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      out.push({ type: "equal", text: A[x - 1] });
      x--;
      y--;
    }
    if (d > 0) {
      if (x === prevX) out.push({ type: "insert", text: B[y - 1] });
      else out.push({ type: "delete", text: A[x - 1] });
    }
    x = prevX;
    y = prevY;
  }
  out.reverse();
  return [...head, ...out, ...tail];
}
