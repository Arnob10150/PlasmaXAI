export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.22em] text-blue-700">
          <i className="bi bi-gear-fill text-base" aria-hidden="true" />
          Settings
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Workspace settings</h1>
        <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
          Configure report behavior, notifications, theme preferences, and future integration settings.
        </p>
      </div>
      <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-5">
          <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <i className="bi bi-envelope-check-fill text-sm text-blue-700" aria-hidden="true" />
              Email me when a second review is requested
            </span>
            <input type="checkbox" defaultChecked />
          </label>
          <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <i className="bi bi-journal-medical text-sm text-blue-700" aria-hidden="true" />
              Auto-attach doctor notes to report exports
            </span>
            <input type="checkbox" defaultChecked />
          </label>
        </div>
      </div>
    </div>
  );
}

