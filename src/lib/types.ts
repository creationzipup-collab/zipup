export type UserStatus = "pending" | "active" | "suspended";
export type UserRole = "admin" | "manager" | "member" | "viewer";
export type Visibility = "private" | "team" | "company";
export type ProjectRole = "owner" | "editor" | "viewer";
export type AssetKind = "image" | "video";
export type AssetSource = "generated" | "upload";
export type Flag = "pick" | "reject";
export type ColorLabel = "red" | "orange" | "yellow" | "green" | "blue" | "purple";
export type ProviderId = "higgsfield" | "fal" | "mock";

export type GenerationStatus =
  | "pending" // 사내 대기열 (공급자 동시 실행 한도 대기)
  | "queued" // 공급자 대기열
  | "in_progress"
  | "finalizing" // 결과물을 스토리지로 복사 중
  | "completed"
  | "failed"
  | "nsfw"
  | "canceled";

export const ACTIVE_STATUSES: GenerationStatus[] = ["pending", "queued", "in_progress", "finalizing"];
export const TERMINAL_STATUSES: GenerationStatus[] = ["completed", "failed", "nsfw", "canceled"];
/** 과금되지 않는 종료 상태 (환불) */
export const REFUNDED_STATUSES: GenerationStatus[] = ["failed", "nsfw", "canceled"];

/** 생성 입력 에셋 (에셋 ID 기준) */
export type GenerationInputs = {
  /** 이미지 레퍼런스 / 편집 대상 */
  images?: string[];
  /** 영상 시작 프레임 */
  startFrame?: string;
  /** 영상 끝 프레임 */
  endFrame?: string;
  /** 영상 레퍼런스 / 편집·연장 대상 */
  videos?: string[];
  /** 오디오 레퍼런스 (확장용) */
  audios?: string[];
};

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "최고관리자",
  manager: "팀장",
  member: "멤버",
  viewer: "뷰어",
};

export const STATUS_LABEL: Record<UserStatus, string> = {
  pending: "승인 대기",
  active: "활성",
  suspended: "정지",
};

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  private: "비공개",
  team: "팀 공개",
  company: "전사 공개",
};

export const COLOR_LABELS: { value: ColorLabel; label: string; hex: string; key: string }[] = [
  { value: "red", label: "빨강", hex: "#FF4D4F", key: "6" },
  { value: "orange", label: "주황", hex: "#FF8A3D", key: "" },
  { value: "yellow", label: "노랑", hex: "#F5C542", key: "7" },
  { value: "green", label: "초록", hex: "#3DD68C", key: "8" },
  { value: "blue", label: "파랑", hex: "#4C8DFF", key: "9" },
  { value: "purple", label: "보라", hex: "#A974FF", key: "" },
];

export const GENERATION_STATUS_LABEL: Record<GenerationStatus, string> = {
  pending: "대기 중",
  queued: "대기열",
  in_progress: "생성 중",
  finalizing: "저장 중",
  completed: "완료",
  failed: "실패",
  nsfw: "검열됨",
  canceled: "취소됨",
};
