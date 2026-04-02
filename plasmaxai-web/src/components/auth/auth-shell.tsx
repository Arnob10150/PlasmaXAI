import { LogoLockup } from "@/components/shared/logo-lockup";
import { Button } from "@/components/ui/button";

const authHighlights = [
  { value: "97.76%", label: "Model AUC", iconClass: "bi bi-graph-up-arrow" },
  { value: "Doctor notes", label: "Built into every case review", iconClass: "bi bi-journal-medical" },
  { value: "Saved history", label: "Return to patient timelines anytime", iconClass: "bi bi-clock-history" },
];

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.18),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(15,118,110,0.18),_transparent_32%),linear-gradient(180deg,_#f8fbff_0%,_#eef5fb_100%)]">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:px-8">
        <section className="hidden overflow-hidden rounded-[36px] border border-white/70 bg-[linear-gradient(180deg,#071125,#0f172a)] p-7 text-white shadow-[0_30px_80px_rgba(15,23,42,0.18)] lg:flex lg:flex-col">
          <LogoLockup />
          <div className="mt-12 max-w-xl space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-medium text-blue-200">
              <i className="bi bi-shield-lock-fill text-base" aria-hidden="true" />
              PlasmaXAI doctor workspace
            </div>
            <h1 className="text-5xl font-semibold tracking-tight">
              Review malignant plasma-cell findings in a calm, interactive clinical interface.
            </h1>
            <p className="text-lg leading-8 text-slate-300">
              Built for explainable case review, saved histories, patient comparison, and report-driven workflows.
            </p>
          </div>
          <div className="mt-auto grid gap-4 md:grid-cols-3">
            {authHighlights.map((item) => (
              <div key={item.label} className="rounded-[26px] border border-white/10 bg-white/8 p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-white/10 p-3 text-blue-100">
                    <i className={`${item.iconClass} text-lg`} aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold">{item.value}</p>
                    <p className="mt-2 text-sm text-slate-300">{item.label}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center">
          <div className="w-full max-w-xl rounded-[32px] border border-white/80 bg-white/92 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.10)] backdrop-blur sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.24em] text-blue-700">
                <i className="bi bi-person-lock text-base" aria-hidden="true" />
                Secure access
              </div>
              <Button href="/" variant="secondary" size="sm">
                <i className="bi bi-house-door-fill text-sm" aria-hidden="true" />
                Return to home
              </Button>
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{title}</h2>
            <p className="mt-3 text-base leading-7 text-slate-600">{subtitle}</p>
            <div className="mt-8">{children}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
