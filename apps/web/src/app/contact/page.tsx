import Link from "next/link";

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.14),_transparent_32%),linear-gradient(180deg,_#f8fbff_0%,_#eef5fb_100%)]">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/92 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
          <div>
            <p className="text-sm font-medium text-slate-500">Contact</p>
            <p className="text-lg font-semibold text-slate-900">PlasmaXAI support</p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-300 hover:text-slate-950"
          >
            <i className="bi bi-house-door-fill text-sm" aria-hidden="true" />
            Home
          </Link>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10 lg:px-10">
        <div className="rounded-[32px] border border-white/70 bg-white/88 p-8 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          <p className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.22em] text-blue-700">
            <i className="bi bi-headset text-base" aria-hidden="true" />
            Workspace contact
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
            Reach the PlasmaXAI coordination desk.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">
            Use this contact page for platform coordination, research presentation support, and clinical workspace
            questions related to the PlasmaXAI review environment.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <i className="bi bi-geo-alt-fill text-sm text-blue-700" aria-hidden="true" />
              Location
            </p>
            <p className="mt-3 text-base font-semibold text-slate-950">Dhaka, Bangladesh</p>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              PlasmaXAI clinical review coordination and project communication base.
            </p>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <i className="bi bi-envelope-fill text-sm text-blue-700" aria-hidden="true" />
              Contact channel
            </p>
            <p className="mt-3 text-base font-semibold text-slate-950">arnob.aich@ieee.org</p>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              For demonstrations, review meetings, competition communication, and deployment support, use the project contact email.
            </p>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <i className="bi bi-clock-fill text-sm text-blue-700" aria-hidden="true" />
              Availability
            </p>
            <p className="mt-3 text-base font-semibold text-slate-950">Project and review support</p>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              Support is intended for research presentation, competition packaging, and clinical workflow demonstration.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
