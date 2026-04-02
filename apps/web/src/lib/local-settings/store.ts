import { access, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { shouldUseFilesystemLocalStore } from "@/lib/supabase/config";

export interface LocalWorkspaceSettings {
  includeFocusMapInReport: boolean;
  includeExplainabilityCharts: boolean;
  autoGenerateReportAfterAnalysis: boolean;
  defaultCaseStatus: string;
  compactDashboardCards: boolean;
}

const LOCAL_DATA_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), ".local-data");
const LOCAL_SETTINGS_FILE = path.join(LOCAL_DATA_DIR, "settings.json");

const defaultSettings: LocalWorkspaceSettings = {
  includeFocusMapInReport: true,
  includeExplainabilityCharts: true,
  autoGenerateReportAfterAnalysis: true,
  defaultCaseStatus: "new",
  compactDashboardCards: false,
};

async function ensureSettingsStore() {
  if (!shouldUseFilesystemLocalStore()) {
    return;
  }

  await mkdir(LOCAL_DATA_DIR, { recursive: true });
  try {
    await access(LOCAL_SETTINGS_FILE);
  } catch {
    await writeFile(LOCAL_SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2), "utf-8");
  }
}

export async function getLocalWorkspaceSettings() {
  if (!shouldUseFilesystemLocalStore()) {
    return defaultSettings;
  }

  await ensureSettingsStore();
  const raw = await readFile(LOCAL_SETTINGS_FILE, "utf-8");
  return {
    ...defaultSettings,
    ...(JSON.parse(raw) as Partial<LocalWorkspaceSettings>),
  };
}

export async function updateLocalWorkspaceSettings(updates: Partial<LocalWorkspaceSettings>) {
  if (!shouldUseFilesystemLocalStore()) {
    return {
      ...defaultSettings,
      ...updates,
    };
  }

  const current = await getLocalWorkspaceSettings();
  const next = {
    ...current,
    ...updates,
  };
  await writeFile(LOCAL_SETTINGS_FILE, JSON.stringify(next, null, 2), "utf-8");
  return next;
}
