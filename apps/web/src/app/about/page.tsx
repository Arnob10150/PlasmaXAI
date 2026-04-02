import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.12),_transparent_32%),linear-gradient(180deg,_#f8fbff_0%,_#eef5fb_100%)]">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/92 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
          <div>
            <p className="text-sm font-medium text-slate-500">About PlasmaXAI</p>
            <p className="text-lg font-semibold text-slate-900">Clinical review support</p>
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

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10 lg:px-10">
        <div className="rounded-[32px] border border-white/70 bg-white/88 p-8 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          <p className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.22em] text-blue-700">
            <i className="bi bi-activity text-base" aria-hidden="true" />
            Platform overview
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
            Explainable plasma-cell review for day-to-day hematology practice.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">
            PlasmaXAI combines microscopy review, focus-map guidance, morphology cue profiling, case follow-up,
            and clinician-ready reporting in one workspace built for plasma-cell interpretation rather than
            developer diagnostics.
          </p>
        </div>

        <div className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm">
          <p className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.22em] text-blue-700">
            <i className="bi bi-person-badge-fill text-base" aria-hidden="true" />
            Built by
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Arnob Aich Anurag</h2>
          <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">
            PlasmaXAI was built by Arnob Aich Anurag, a Computer Science and Engineering student at
            American International University-Bangladesh (AIUB) and a publicly listed volunteer within
            the IEEE AIUB Student Branch community. The platform reflects his applied interest in
            explainable artificial intelligence, clinically useful review interfaces, and deployable
            decision-support systems for real-world healthcare workflows.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <i className="bi bi-mortarboard-fill text-sm text-blue-700" aria-hidden="true" />
                Academic profile
              </p>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Computer Science and Engineering student, American International University-Bangladesh.
              </p>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <i className="bi bi-diagram-3-fill text-sm text-blue-700" aria-hidden="true" />
                Professional community
              </p>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Publicly listed with the IEEE AIUB Student Branch volunteer team and active in student-led technology initiatives.
              </p>
            </div>
          </div>
          <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-950 px-5 py-4 text-white">
            <p className="inline-flex items-center gap-2 text-sm font-medium text-blue-200">
              <i className="bi bi-envelope-fill text-sm" aria-hidden="true" />
              Contact email
            </p>
            <p className="mt-2 text-lg font-semibold">arnob.aich@ieee.org</p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {[
            {
              title: "Microscopy-first review",
              body: "Zoom, pan, and inspect the uploaded cell image while comparing the focus map against the true morphology field.",
              icon: "bi bi-bounding-box-circles",
            },
            {
              title: "Doctor-facing explainability",
              body: "Use morphology profiles, focus-map interpretation, and review pathways to support sign-out without reading model internals.",
              icon: "bi bi-diagram-3-fill",
            },
            {
              title: "Report-ready workflow",
              body: "Edit the report summary, complete the review checklist, and finalize a downloadable clinical report from the same case page.",
              icon: "bi bi-file-earmark-medical-fill",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <i className={`${item.icon} text-lg`} aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-xl font-semibold text-slate-950">{item.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">{item.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
