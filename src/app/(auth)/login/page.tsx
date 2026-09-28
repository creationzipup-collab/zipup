import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/session";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "로그인" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const u = await getCurrentUser();
  const { next } = await searchParams;
  if (u) redirect(u.status === "active" ? (next && next.startsWith("/") ? next : "/") : "/pending");
  return <LoginForm next={next} googleEnabled={!!(env.google.clientId && env.google.clientSecret)} />;
}
