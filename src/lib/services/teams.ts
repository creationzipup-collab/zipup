import "server-only";

import { asc, count } from "drizzle-orm";

import { db } from "@/lib/db";
import { teams } from "@/lib/db/schema";

export const DEFAULT_TEAMS = [
  { name: "AI제작팀", slug: "ai-production", color: "#FF5B24", description: "AI 영상·이미지 제작", sortOrder: 1 },
  { name: "기획팀", slug: "planning", color: "#4C8DFF", description: "기획·시안·레퍼런스", sortOrder: 2 },
  { name: "연출팀", slug: "directing", color: "#A974FF", description: "연출·스토리보드·콘티", sortOrder: 3 },
  { name: "엔터팀", slug: "entertainment", color: "#FF7CD9", description: "아티스트·콘텐츠", sortOrder: 4 },
  { name: "AI캐릭터팀", slug: "ai-character", color: "#3DD68C", description: "AI 캐릭터 개발", sortOrder: 5 },
];

let ensured = false;

/** 팀이 하나도 없으면 기본 5개 팀 생성 (최초 실행 시) */
export async function ensureDefaultTeams() {
  if (ensured) return;
  const [{ value }] = await db.select({ value: count() }).from(teams);
  if (value === 0) {
    await db.insert(teams).values(DEFAULT_TEAMS).onConflictDoNothing();
  }
  ensured = true;
}

export async function listTeams() {
  await ensureDefaultTeams();
  return db.select().from(teams).orderBy(asc(teams.sortOrder), asc(teams.name));
}
