"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { SettingsActionState } from "@/app/(workspace)/settings/actions";
import { Button } from "@/components/ui/button";

const initialState: SettingsActionState = {
  error: null,
  success: null,
};

function SaveSettingsButton() {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full sm:w-auto" size="sm" type="submit">
      <i className={`bi ${pending ? "bi-arrow-repeat" : "bi-sliders"} text-sm`} aria-hidden="true" />
      {pending ? "Saving..." : "Save settings"}
    </Button>
  );
}

export function WorkspaceSettingsForm({
  settings,
  action,
}: {
  settings: {
    includeFocusMapInReport: boolean;
    includeExplainabilityCharts: boolean;
    autoGenerateReportAfterAnalysis: boolean;
    defaultCaseStatus: string;
    compactDashboardCards: boolean;
  };
  action: (state: SettingsActionState, formData: FormData) => Promise<SettingsActionState>;
}) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-5 rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-950">
          <i className="bi bi-gear-wide-connected text-base text-blue-700" aria-hidden="true" />
          Review and reporting preferences
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          Tune how the doctor workspace presents focus maps, explainability diagrams, report generation, and archive behavior.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Include focus map in report</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">Adds the microscopy overlay panel to exported clinical reports.</p>
            </div>
            <input defaultChecked={settings.includeFocusMapInReport} name="includeFocusMapInReport" type="checkbox" />
          </div>
        </label>

        <label className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Include explainability diagrams</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">Keeps confidence bands, cue charts, and review graphics in the exported report.</p>
            </div>
            <input defaultChecked={settings.includeExplainabilityCharts} name="includeExplainabilityCharts" type="checkbox" />
          </div>
        </label>

        <label className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Auto-generate report after analysis</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">Prepares a doctor-facing report as soon as PlasmaXAI completes the case analysis.</p>
            </div>
            <input defaultChecked={settings.autoGenerateReportAfterAnalysis} name="autoGenerateReportAfterAnalysis" type="checkbox" />
          </div>
        </label>

        <label className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Compact dashboard cards</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">Reduces white space across the dashboard for denser workstation-style review.</p>
            </div>
            <input defaultChecked={settings.compactDashboardCards} name="compactDashboardCards" type="checkbox" />
          </div>
        </label>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
        <label className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
          <i className="bi bi-ui-checks-grid text-sm text-blue-700" aria-hidden="true" />
          Default case status after upload
        </label>
        <select className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 md:max-w-sm" defaultValue={settings.defaultCaseStatus} name="defaultCaseStatus">
          <option value="new">New</option>
          <option value="reviewed">Reviewed</option>
          <option value="needs_second_review">Needs second review</option>
          <option value="follow_up_required">Follow-up required</option>
          <option value="report_ready">Report ready</option>
        </select>
      </div>

      {state.error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.success}</p>
      ) : null}

      <SaveSettingsButton />
    </form>
  );
}
