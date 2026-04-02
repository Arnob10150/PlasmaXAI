import { updateSettingsAction } from "@/app/(workspace)/settings/actions";
import { WorkspaceSettingsForm } from "@/components/settings/workspace-settings-form";
import { Badge } from "@/components/ui/badge";
import { getHostedDemoWorkspaceSettings } from "@/lib/demo/session-settings";
import { hasSupabaseConfig, shouldUseFilesystemLocalStore } from "@/lib/supabase/config";

export default async function SettingsPage() {
  let settings;

  if (hasSupabaseConfig()) {
    settings = await getHostedDemoWorkspaceSettings();
  } else if (shouldUseFilesystemLocalStore()) {
    const { getLocalWorkspaceSettings } = await import("@/lib/local-settings/store");
    settings = await getLocalWorkspaceSettings();
  } else {
    settings = await getHostedDemoWorkspaceSettings();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.22em] text-blue-700">
            <i className="bi bi-gear-fill text-base" aria-hidden="true" />
            Settings
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Workspace settings</h1>
          <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
            Configure how PlasmaXAI presents focus maps, explainability diagrams, report exports, and case-review defaults.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={settings.includeExplainabilityCharts ? "info" : "neutral"}>Explainability diagrams</Badge>
          <Badge variant={settings.includeFocusMapInReport ? "success" : "neutral"}>Focus map in reports</Badge>
        </div>
      </div>

      <WorkspaceSettingsForm action={updateSettingsAction} settings={settings} />
    </div>
  );
}
