export default function ProfilePage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.22em] text-blue-700">
          <i className="bi bi-person-badge-fill text-base" aria-hidden="true" />
          Profile
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Doctor account</h1>
        <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
          Manage account details, organization information, and future role-based access controls.
        </p>
      </div>
      <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <i className="bi bi-person-vcard-fill text-sm text-blue-700" aria-hidden="true" />
              Full name
            </label>
            <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
              <i className="bi bi-person-circle text-sm text-slate-400" aria-hidden="true" />
              <input className="h-full w-full bg-transparent outline-none" defaultValue="Dr. Arnob Aich Anurag" />
            </div>
          </div>
          <div>
            <label className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <i className="bi bi-heart-pulse-fill text-sm text-blue-700" aria-hidden="true" />
              Specialization
            </label>
            <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
              <i className="bi bi-hospital text-sm text-slate-400" aria-hidden="true" />
              <input className="h-full w-full bg-transparent outline-none" defaultValue="Hematopathology" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

