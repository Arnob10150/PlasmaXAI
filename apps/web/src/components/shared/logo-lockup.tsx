export function LogoLockup() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#2563eb,#0f766e)] text-white shadow-lg">
        <i className="bi bi-activity text-lg" aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500">Clinical AI workspace</p>
        <p className="text-lg font-semibold text-slate-950">PlasmaXAI</p>
      </div>
    </div>
  );
}