import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type {
  AssetKind,
  AssetSource,
  ColorLabel,
  CutStatus,
  Flag,
  GenerationInputs,
  GenerationStatus,
  ProjectRole,
  ProviderId,
  UserRole,
  UserStatus,
  Visibility,
} from "../types";

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/* -------------------------------------------------------------------------- */
/*                                   Auth                                     */
/* -------------------------------------------------------------------------- */

export const user = pgTable(
  "user",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    email: text().notNull().unique(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    ...timestamps,
    // --- ZIPUP AI fields -----------------------------------------------------
    status: text().$type<UserStatus>().notNull().default("pending"),
    role: text().$type<UserRole>().notNull().default("member"),
    teamId: uuid().references(() => teams.id, { onDelete: "set null" }),
    requestedTeamId: uuid(),
    jobTitle: text(),
    /** 개인 월 예산 한도 (micro-USD). null = 개인 한도 없음(팀 한도만 적용) */
    monthlyBudgetMicros: bigint({ mode: "number" }),
    approvedAt: timestamp({ withTimezone: true }),
    approvedBy: text(),
    lastActiveAt: timestamp({ withTimezone: true }),
  },
  (t) => [index().on(t.status), index().on(t.teamId)],
);

export const session = pgTable(
  "session",
  {
    id: text().primaryKey(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    token: text().notNull().unique(),
    ...timestamps,
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index().on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index().on(t.identifier)],
);

/* -------------------------------------------------------------------------- */
/*                               Organization                                 */
/* -------------------------------------------------------------------------- */

export const teams = pgTable("teams", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull().unique(),
  slug: text().notNull().unique(),
  color: text().notNull().default("#9CA3AF"),
  description: text(),
  /** 팀 월 예산 한도 (micro-USD). null = 무제한 */
  monthlyBudgetMicros: bigint({ mode: "number" }),
  sortOrder: integer().notNull().default(0),
  ...timestamps,
});

/* -------------------------------------------------------------------------- */
/*                                 Projects                                   */
/* -------------------------------------------------------------------------- */

export const projects = pgTable(
  "projects",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    description: text(),
    icon: text(),
    color: text(),
    coverAssetId: uuid(),
    ownerId: text()
      .notNull()
      .references(() => user.id),
    teamId: uuid().references(() => teams.id, { onDelete: "set null" }),
    visibility: text().$type<Visibility>().notNull().default("team"),
    /** 개인 작업공간 (사용자별 1개, 기본 저장 위치) */
    isPersonal: boolean().notNull().default(false),
    /** 자동 파일명의 순번 */
    assetSeq: integer().notNull().default(0),
    archivedAt: timestamp({ withTimezone: true }),
    lastActivityAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    index().on(t.ownerId),
    index().on(t.teamId),
    index().on(t.lastActivityAt),
    // 사용자당 개인 작업공간 1개 (동시 요청 경쟁 방지)
    uniqueIndex("projects_one_personal_per_owner").on(t.ownerId).where(sql`${t.isPersonal} = true and ${t.archivedAt} is null`),
  ],
);

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text().$type<ProjectRole>().notNull().default("editor"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] }), index().on(t.userId)],
);

/* -------------------------------------------------------------------------- */
/*                                Generation                                  */
/* -------------------------------------------------------------------------- */

export const generations = pgTable(
  "generations",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** 같은 요청(여러 장 생성)을 묶는 ID */
    batchId: uuid().notNull(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id),
    teamId: uuid().references(() => teams.id, { onDelete: "set null" }),
    modelId: text().notNull(),
    provider: text().$type<ProviderId>().notNull(),
    endpoint: text().notNull(),
    kind: text().$type<AssetKind>().notNull(),
    workflow: text().notNull(),
    status: text().$type<GenerationStatus>().notNull().default("pending"),
    prompt: text().notNull().default(""),
    /** UI에서 고른 설정값 (모델 파라미터) */
    params: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    /** 입력 에셋 (레퍼런스, 시작/끝 프레임 등) */
    inputs: jsonb().$type<GenerationInputs>().notNull().default({}),
    /** 실제로 공급자에 보낸 요청 본문 */
    requestBody: jsonb().$type<Record<string, unknown>>(),
    providerRequestId: text(),
    providerStatusUrl: text(),
    providerResponseUrl: text(),
    providerCancelUrl: text(),
    providerPayload: jsonb().$type<unknown>(),
    correlationId: text(),
    errorMessage: text(),
    estimatedCostMicros: bigint({ mode: "number" }).notNull().default(0),
    costMicros: bigint({ mode: "number" }),
    expectedOutputs: integer().notNull().default(1),
    outputCount: integer().notNull().default(0),
    isDraft: boolean().notNull().default(false),
    /** Seedance 드래프트 ID (같은 테이크를 1080p로 완성할 때 사용, 7일 유효) */
    draftId: text(),
    draftExpiresAt: timestamp({ withTimezone: true }),
    /** 공급자가 사용한 시드 (재현용) */
    seed: bigint({ mode: "number" }),
    parentGenerationId: uuid(),
    /** 결과물을 넣을 컷 (없으면 프로젝트에 바로) */
    cutId: uuid(),
    /** 이 생성에 쓴 컷 프롬프트 버전 (버전별 테이크 보기) */
    promptVersionId: uuid(),
    canvasId: uuid(),
    canvasNodeId: text(),
    submitAttempts: integer().notNull().default(0),
    pollAttempts: integer().notNull().default(0),
    submittedAt: timestamp({ withTimezone: true }),
    startedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    lastPolledAt: timestamp({ withTimezone: true }),
    nextPollAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.status, t.provider),
    index().on(t.userId, t.createdAt),
    index().on(t.teamId, t.createdAt),
    index().on(t.projectId, t.createdAt),
    index().on(t.batchId),
    index().on(t.providerRequestId),
    index().on(t.canvasId),
    index().on(t.cutId, t.status),
    index().on(t.promptVersionId),
  ],
);

/* -------------------------------------------------------------------------- */
/*                                    Cuts                                    */
/* -------------------------------------------------------------------------- */

/** 프로젝트 안의 컷(샷). 클립은 컷마다 테이크 번호를 받아요. 컷 없이 쓰는 프로젝트도 있어요. */
export const cuts = pgTable(
  "cuts",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** 컷 번호 (C001, S02_C05 …) — 프로젝트 안에서 고유 */
    code: text().notNull(),
    title: text(),
    /** 연출 메모 */
    note: text(),
    status: text().$type<CutStatus>().notNull().default("todo"),
    /** 담당 */
    assigneeId: text().references(() => user.id, { onDelete: "set null" }),
    position: integer().notNull().default(0),
    /** 테이크 번호 발급용 */
    takeSeq: integer().notNull().default(0),
    /** 대표 테이크 */
    coverAssetId: uuid(),
    createdBy: text()
      .notNull()
      .references(() => user.id),
    lastActivityAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [index().on(t.projectId, t.position), uniqueIndex("cuts_project_code_uq").on(t.projectId, t.code), index().on(t.assigneeId)],
);

export const assets = pgTable(
  "assets",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    generationId: uuid().references(() => generations.id, { onDelete: "set null" }),
    /** 속한 컷 (없으면 프로젝트에 바로) */
    cutId: uuid().references(() => cuts.id, { onDelete: "set null" }),
    /** 컷 안의 테이크 번호 (T01, T02 …) */
    take: integer(),
    userId: text()
      .notNull()
      .references(() => user.id),
    teamId: uuid().references(() => teams.id, { onDelete: "set null" }),
    kind: text().$type<AssetKind>().notNull(),
    source: text().$type<AssetSource>().notNull(),
    storageKey: text().notNull(),
    thumbKey: text(),
    mimeType: text().notNull(),
    width: integer(),
    height: integer(),
    durationSec: real(),
    sizeBytes: bigint({ mode: "number" }),
    filename: text().notNull(),
    seq: integer().notNull().default(0),
    outputIndex: integer().notNull().default(0),
    prompt: text().notNull().default(""),
    modelId: text(),
    rating: smallint().notNull().default(0),
    flag: text().$type<Flag>(),
    colorLabel: text().$type<ColorLabel>(),
    /** 검색용 정규화 텍스트 (프롬프트·파일명·태그·모델명 등) */
    searchText: text().notNull().default(""),
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.projectId, t.createdAt),
    index().on(t.userId, t.createdAt),
    index().on(t.teamId, t.createdAt),
    index().on(t.generationId),
    index().on(t.cutId, t.take),
    index().on(t.createdAt),
    index("assets_search_trgm_idx").using("gin", sql`${t.searchText} gin_trgm_ops`),
  ],
);

export const tags = pgTable("tags", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull().unique(),
  color: text(),
  createdBy: text().references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const assetTags = pgTable(
  "asset_tags",
  {
    assetId: uuid()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    tagId: uuid()
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.assetId, t.tagId] }), index().on(t.tagId)],
);

export const favorites = pgTable(
  "favorites",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    assetId: uuid()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.assetId] }), index().on(t.assetId)],
);

export const collections = pgTable(
  "collections",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text(),
    createdBy: text()
      .notNull()
      .references(() => user.id),
    ...timestamps,
  },
  (t) => [index().on(t.projectId)],
);

export const collectionItems = pgTable(
  "collection_items",
  {
    collectionId: uuid()
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    assetId: uuid()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    position: integer().notNull().default(0),
    addedBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.assetId] }), index().on(t.assetId)],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid().primaryKey().defaultRandom(),
    assetId: uuid()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id),
    body: text().notNull(),
    ...timestamps,
  },
  (t) => [index().on(t.assetId, t.createdAt)],
);

/* -------------------------------------------------------------------------- */
/*                                  Canvas                                    */
/* -------------------------------------------------------------------------- */

export type CanvasGraph = {
  nodes: unknown[];
  edges: unknown[];
  viewport?: { x: number; y: number; zoom: number };
  /** 캔버스 위에 그린 스케치 (캔버스 좌표) */
  sketch?: { id: string; color: string; size: number; points: number[][]; author?: { id: string; name: string } | null }[];
};

export const canvases = pgTable(
  "canvases",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text().notNull(),
    graph: jsonb().$type<CanvasGraph>().notNull().default({ nodes: [], edges: [] }),
    createdBy: text()
      .notNull()
      .references(() => user.id),
    updatedBy: text().references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index().on(t.projectId)],
);

/* -------------------------------------------------------------------------- */
/*                               Prompt library                               */
/* -------------------------------------------------------------------------- */

export const promptPresets = pgTable(
  "prompt_presets",
  {
    id: uuid().primaryKey().defaultRandom(),
    title: text().notNull(),
    prompt: text().notNull(),
    kind: text().$type<AssetKind | "any">().notNull().default("any"),
    modelId: text(),
    params: jsonb().$type<Record<string, unknown>>(),
    tags: text().array().notNull().default(sql`'{}'::text[]`),
    visibility: text().$type<Visibility>().notNull().default("private"),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    teamId: uuid().references(() => teams.id, { onDelete: "set null" }),
    useCount: integer().notNull().default(0),
    /** 최신 버전 번호 (prompt 컬럼은 항상 최신 버전 내용) */
    latestVersion: integer().notNull().default(1),
    /** 직접 "공유"한 때 — 이 값이 있어야 프롬프트 게시판에 떠요 (저장만 한 건 안 뜸) */
    sharedAt: timestamp({ withTimezone: true }),
    sharedBy: text().references(() => user.id, { onDelete: "set null" }),
    /** 이 프롬프트로 나온 클립 (게시판 썸네일) */
    sourceAssetId: uuid().references(() => assets.id, { onDelete: "set null" }),
    /**
     * 컷 작업 기록: 값이 있으면 라이브러리에는 안 보이고 그 컷(컷 없는 프로젝트는 프로젝트) 안에서만 버전이 올라가요.
     * 프로젝트 멤버가 함께 봐요.
     */
    projectId: uuid().references(() => projects.id, { onDelete: "cascade" }),
    cutId: uuid().references(() => cuts.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index().on(t.userId), index().on(t.teamId), index().on(t.sharedAt), index().on(t.projectId, t.cutId, t.kind)],
);

/**
 * 프롬프트 공유 — 한 번 보낼 때마다 한 줄. 사람·팀·전사 중 하나로 보내고, 메시지와 클립을 함께 붙여요.
 * 받은 사람에게는 알림이 가고, 그 프롬프트의 대화방에서 이야기해요.
 */
export const promptShares = pgTable(
  "prompt_shares",
  {
    id: uuid().primaryKey().defaultRandom(),
    presetId: uuid()
      .notNull()
      .references(() => promptPresets.id, { onDelete: "cascade" }),
    fromUserId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    target: text().$type<"user" | "team" | "company">().notNull(),
    toUserId: text().references(() => user.id, { onDelete: "cascade" }),
    toTeamId: uuid().references(() => teams.id, { onDelete: "cascade" }),
    message: text(),
    /** 함께 보낸 클립 */
    assetId: uuid().references(() => assets.id, { onDelete: "set null" }),
    /** 사람에게 보낸 공유: 받은 사람이 열어 본 때 */
    seenAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.presetId),
    index().on(t.toUserId, t.createdAt),
    index().on(t.toTeamId, t.createdAt),
    index().on(t.fromUserId, t.createdAt),
    index().on(t.target, t.createdAt),
  ],
);

/** 공유한 프롬프트의 대화 */
export const promptMessages = pgTable(
  "prompt_messages",
  {
    id: uuid().primaryKey().defaultRandom(),
    presetId: uuid()
      .notNull()
      .references(() => promptPresets.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.presetId, t.createdAt)],
);

/** 프롬프트 버전 기록 (저장할 때마다 v1, v2 …) */
export const promptVersions = pgTable(
  "prompt_versions",
  {
    id: uuid().primaryKey().defaultRandom(),
    presetId: uuid()
      .notNull()
      .references(() => promptPresets.id, { onDelete: "cascade" }),
    version: integer().notNull(),
    prompt: text().notNull(),
    /** 이번 버전에서 바꾼 점 */
    note: text(),
    modelId: text(),
    params: jsonb().$type<Record<string, unknown>>(),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("prompt_versions_preset_version_uq").on(t.presetId, t.version)],
);

/** 번역 캐시 (같은 문장을 다시 번역하지 않도록) */
export const promptTranslations = pgTable("prompt_translations", {
  /** sha256(방향 + 원문) */
  hash: text().primaryKey(),
  sourceLang: text().notNull(),
  targetLang: text().notNull(),
  source: text().notNull(),
  /** [{ src, dst }] 구간별 대응 */
  segments: jsonb().$type<{ src: string; dst: string }[]>().notNull(),
  model: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** LLM·번역 API 사용 기록 (번역·단어 추천 비용 확인용) */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().references(() => user.id, { onDelete: "set null" }),
    feature: text().notNull(),
    model: text().notNull(),
    costMicros: bigint({ mode: "number" }).notNull().default(0),
    /** 번역 API로 보낸 글자 수 (무료 한도 확인용) */
    units: integer().notNull().default(0),
    cached: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.createdAt), index().on(t.userId)],
);

/** 번역·사전 결과 캐시 (구간·단어 단위, 회사 전체가 공유) */
export const lexiconCache = pgTable("lexicon_cache", {
  /** sha256(종류 + 방향 + 원문) */
  key: text().primaryKey(),
  kind: text().$type<"mt" | "dict">().notNull(),
  sourceLang: text().notNull(),
  targetLang: text().notNull(),
  source: text().notNull(),
  result: jsonb().$type<unknown>().notNull(),
  provider: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const savedSearches = pgTable(
  "saved_searches",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    query: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId)],
);

/* -------------------------------------------------------------------------- */
/*                           Notifications & audit                            */
/* -------------------------------------------------------------------------- */

export const notifications = pgTable(
  "notifications",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text().notNull(),
    title: text().notNull(),
    body: text(),
    href: text(),
    readAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.createdAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid().primaryKey().defaultRandom(),
    actorId: text().references(() => user.id, { onDelete: "set null" }),
    action: text().notNull(),
    targetType: text(),
    targetId: text(),
    meta: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.createdAt), index().on(t.actorId)],
);

/* -------------------------------------------------------------------------- */
/*                                 Settings                                   */
/* -------------------------------------------------------------------------- */

export const modelSettings = pgTable("model_settings", {
  modelId: text().primaryKey(),
  enabled: boolean().notNull().default(true),
  /** 단가 덮어쓰기: { [priceKey]: USD } */
  priceOverrides: jsonb().$type<Record<string, number>>(),
  notes: text(),
  /** 공급자 고정 (null = 자동: 기본 공급자 → 키가 있는 대체 공급자 순) */
  provider: text().$type<"higgsfield" | "fal">(),
  updatedBy: text().references(() => user.id, { onDelete: "set null" }),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const appSettings = pgTable("app_settings", {
  key: text().primaryKey(),
  value: jsonb().$type<unknown>().notNull(),
  updatedBy: text().references(() => user.id, { onDelete: "set null" }),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

