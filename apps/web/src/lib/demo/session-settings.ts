import { cookies } from "next/headers";
import { decodeCookiePayload, encodeCookiePayload } from "@/lib/demo/cookie-codec";
import type { LocalWorkspaceSettings } from "@/lib/local-settings/store";

const SETTINGS_COOKIE = "plasmaxai-demo-settings";

export const demoDefaultWorkspaceSettings: LocalWorkspaceSettings = {
  includeFocusMapInReport: true,
  includeExplainabilityCharts: true,
  autoGenerateReportAfterAnalysis: true,
  defaultCaseStatus: "new",
  compactDashboardCards: false,
};

export async function getHostedDemoWorkspaceSettings(): Promise<LocalWorkspaceSettings> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SETTINGS_COOKIE)?.value;

  if (!raw) {
    return demoDefaultWorkspaceSettings;
  }

  const parsed = decodeCookiePayload<Partial<LocalWorkspaceSettings>>(raw);
  if (!parsed) {
    return demoDefaultWorkspaceSettings;
  }

  return {
    ...demoDefaultWorkspaceSettings,
    ...parsed,
  };
}

export async function setHostedDemoWorkspaceSettings(
  updates: Partial<LocalWorkspaceSettings>,
): Promise<LocalWorkspaceSettings> {
  const current = await getHostedDemoWorkspaceSettings();
  const next: LocalWorkspaceSettings = {
    ...current,
    ...updates,
  };

  const cookieStore = await cookies();
  cookieStore.set(SETTINGS_COOKIE, encodeCookiePayload(next), {
    httpOnly: false,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return next;
}
