import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/services/settings";
import { listTeams } from "@/lib/services/teams";

import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "가입 신청" };

export default async function SignupPage() {
  const u = await getCurrentUser();
  if (u) redirect(u.status === "active" ? "/" : "/pending");
  const [teams, settings] = await Promise.all([listTeams(), getSettings()]);
  return (
    <SignupForm
      teams={teams.map((t) => ({ id: t.id, name: t.name, color: t.color, description: t.description }))}
      allowSignup={settings.allowSignup}
      domains={settings.signupDomains}
    />
  );
}
