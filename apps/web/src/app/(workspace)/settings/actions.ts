"use server";

import { revalidatePath } from "next/cache";
import { getHostedDemoWorkspaceSettings, setHostedDemoWorkspaceSettings } from "@/lib/demo/session-settings";
import { hasSupabaseConfig, shouldUseFilesystemLocalStore } from "@/lib/supabase/config";

export interface SettingsActionState {
  error: string | null;
  success: string | null;
}

export async function updateSettingsAction(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    const payload = {
      includeFocusMapInReport: formData.get("includeFocusMapInReport") === "on",
      includeExplainabilityCharts: formData.get("includeExplainabilityCharts") === "on",
      autoGenerateReportAfterAnalysis: formData.get("autoGenerateReportAfterAnalysis") === "on",
      compactDashboardCards: formData.get("compactDashboardCards") === "on",
      defaultCaseStatus:
        typeof formData.get("defaultCaseStatus") === "string"
          ? String(formData.get("defaultCaseStatus"))
          : "new",
    };

    if (!hasSupabaseConfig()) {
      if (!shouldUseFilesystemLocalStore()) {
        await setHostedDemoWorkspaceSettings(payload);
      } else {
        const { updateLocalWorkspaceSettings } = await import("@/lib/local-settings/store");
        await updateLocalWorkspaceSettings(payload);
      }
    } else {
      await setHostedDemoWorkspaceSettings(payload);
      await getHostedDemoWorkspaceSettings();
    }

    revalidatePath("/settings");
    revalidatePath("/dashboard");
    revalidatePath("/new-case");
    return {
      error: null,
      success: "Workspace settings updated.",
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to update workspace settings.",
      success: null,
    };
  }
}
