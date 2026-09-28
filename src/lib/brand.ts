/**
 * CREATION ZIPUP 브랜드 문장 — 로그인·홈 등 여러 곳에서 같은 말투를 쓰도록 한곳에 모아요.
 */
export const BRAND = {
  name: "CREATION ZIPUP",
  role: "AI & 3D Directors Collective",
  statement: "크리에이션 집업은 AI와 3D를 기반으로 한 영상 디렉터 집단이자 컨텐츠 그룹입니다.",
  principles: [
    { en: "Visual", ko: "비주얼이 지닌 소통의 힘을 굳게 믿어요." },
    { en: "Mix", ko: "예술 간의 믹스를 크리에이티브의 기반으로 생각해요." },
    { en: "Beyond", ko: "AI로 새로운 영상 실험을 하며 전통적인 제약에서 벗어나 효율적으로 작업해요." },
    { en: "Authentic", ko: "진정성 있는 이야기를 창의적인 비주얼로 풀어내요." },
  ],
  /** 영문 세리프로 번갈아 보여줄 한 줄들 */
  taglines: ["Let the visuals speak.", "Mix the arts.", "Beyond the usual limits.", "True stories, bold visuals."],
} as const;
