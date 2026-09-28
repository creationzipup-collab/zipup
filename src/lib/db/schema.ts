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
  uuid,
} from "drizzle-orm/pg-core";

import type {
  AssetKind,
  AssetSource,
  ColorLabel,
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
  (t) => [index().on(t.ownerId), index().on(t.teamId), index().on(t.lastActivityAt)],
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
    parentGenerationId: uuid(),
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
  ],
);

export const assets = pgTable(
  "assets",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    generationId: uuid().references(() => generations.id, { onDelete: "set null" }),
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
    visibility: text().$type<Visibility>().notNull().default("team"),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    teamId: uuid().references(() => teams.id, { onDelete: "set null" }),
    useCount: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [index().on(t.userId), index().on(t.teamId)],
);

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

