import Link from "next/link";
import { MotionDiv } from "@/components/motion/motion-div";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/shared/section-heading";

const highlights = [
  {
    title: "Explainable AI review",
    body: "See prediction confidence, counterfactual drivers, and clinical insight panels in one calm review workspace.",
    iconClass: "bi bi-stars",
  },
  {
    title: "Doctor-first workflow",
    body: "Upload, review, annotate, export, and revisit patient cases without losing context between sessions.",
    iconClass: "bi bi-hospital-fill",
  },
  {
    title: "Traceable reports",
    body: "Create downloadable case reports with image context, findings, and doctor notes ready for discussion.",
    iconClass: "bi bi-file-earmark-pdf-fill",
  },
];

const metrics = [
  { label: "Validation AUC", value: "97.76%", iconClass: "bi bi-graph-up-arrow" },
  { label: "Sensitivity to suspicious plasma cells", value: "94.63%", iconClass: "bi bi-bullseye" },
  { label: "Longitudinal patient archive", value: "Always available", iconClass: "bi bi-clock-history" },
];

export default function Home() {
  return (
    <main className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.16),_transparent_34%),radial-gradient(circle_at_80%_20%,_rgba(15,118,110,0.18),_transparent_28%),linear-gradient(180deg,_#f8fbff_0%,_#eef5fb_48%,_#f8fafc_100%)]" />
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/92 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#2563eb,#0f766e)] text-white">
              <i className="bi bi-activity text-lg" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Clinical workstation</p>
              <p className="text-lg font-semibold text-slate-900">PlasmaXAI</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden text-sm font-medium text-slate-600 transition hover:text-slate-900 sm:block">
              Sign in
            </Link>
            <Button asChild>
              <Link href="/register">Start workspace</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-7xl flex-col gap-16 px-6 py-10 lg:px-10 lg:py-14">

        <div className="grid items-center gap-10 lg:grid-cols-[1.08fr_0.92fr]">
          <MotionDiv
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="space-y-7"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/80 px-4 py-2 text-sm font-medium text-blue-700 shadow-sm">
              <i className="bi bi-shield-check text-base" aria-hidden="true" />
              Explainable plasma cell review for doctors
            </div>
            <div className="space-y-4">
              <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-slate-950 sm:text-6xl">
                Welcome to a trusted clinical workspace for plasma-cell review, patient follow-up, and report-ready decisions.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-600">
                PlasmaXAI brings microscopy review, explainable findings, longitudinal case history, and clinician-ready reporting into one calm review environment.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Button asChild size="lg">
                <Link href="/login">
                  Enter doctor workspace
                  <i className="bi bi-arrow-right text-base" aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {metrics.map((metric) => (
                <div key={metric.label} className="rounded-3xl border border-white/70 bg-white/75 p-5 shadow-[0_20px_40px_rgba(37,99,235,0.06)] backdrop-blur">
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <i className={`${metric.iconClass} text-base text-blue-700`} aria-hidden="true" />
                    {metric.label}
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{metric.value}</p>
                </div>
              ))}
            </div>
          </MotionDiv>

          <MotionDiv
            initial={{ opacity: 0, scale: 0.96, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12, ease: "easeOut" }}
            className="relative"
          >
            <div className="absolute -left-8 top-14 h-24 w-24 rounded-full bg-cyan-200/60 blur-2xl" />
            <div className="absolute -bottom-8 right-12 h-28 w-28 rounded-full bg-blue-200/70 blur-3xl" />
            <div className="relative overflow-hidden rounded-[36px] border border-white/70 bg-[linear-gradient(180deg,_rgba(255,255,255,0.94)_0%,_rgba(240,247,255,0.94)_100%)] p-5 shadow-[0_30px_80px_rgba(15,23,42,0.12)]">
              <div className="rounded-[28px] border border-slate-200 bg-slate-950 p-4 text-slate-50 shadow-inner">
                <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-[22px] bg-[linear-gradient(160deg,#0f172a,#111827)] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-slate-300">Case preview</span>
                      <span className="rounded-full bg-rose-500/20 px-3 py-1 text-xs font-medium text-rose-300">High suspicion</span>
                    </div>
                    <div className="flex aspect-[4/3] items-center justify-center rounded-[18px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.25),_transparent_45%),linear-gradient(180deg,#172554,#0f172a)]">
                      <div className="grid h-[72%] w-[72%] place-items-center rounded-full border border-cyan-300/40 bg-cyan-300/10">
                        <div className="h-28 w-28 rounded-full border border-rose-300/70 bg-[radial-gradient(circle_at_40%_40%,_#fda4af,_#9f1239)] shadow-[0_0_40px_rgba(244,63,94,0.35)]" />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3 rounded-[22px] bg-white p-4 text-slate-900">
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <i className="bi bi-speedometer2 text-base text-blue-700" aria-hidden="true" />
                        Prediction confidence
                      </div>
                      <p className="mt-1 text-3xl font-semibold">94.63%</p>
                      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full w-[94%] rounded-full bg-[linear-gradient(90deg,#2563eb,#0f766e)]" />
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <i className="bi bi-stars text-base text-blue-700" aria-hidden="true" />
                          Counterfactual driver
                        </div>
                        <p className="mt-2 font-semibold">NC ratio</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <i className="bi bi-clipboard2-pulse-fill text-base text-blue-700" aria-hidden="true" />
                          Clinical insight
                        </div>
                        <p className="mt-2 font-semibold">Chromatic shift cluster</p>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="flex items-center gap-2 text-sm text-slate-500">
                          <i className="bi bi-bar-chart-line-fill text-base text-blue-700" aria-hidden="true" />
                          Today&apos;s doctor dashboard
                        </p>
                        <i className="bi bi-graph-up text-base text-blue-600" aria-hidden="true" />
                      </div>
                      <div className="flex h-24 items-end gap-2">
                        {[48, 68, 56, 83, 66, 92, 78].map((height, index) => (
                          <div
                            key={height}
                            className="animated-bar flex-1 rounded-t-full bg-[linear-gradient(180deg,#38bdf8,#2563eb)]"
                            style={{ height: `${height}%`, animationDelay: `${index * 120}ms` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </MotionDiv>
        </div>

        <section className="grid gap-6 lg:grid-cols-3">
          {highlights.map((item, index) => (
            <MotionDiv
              key={item.title}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.2 + index * 0.08 }}
              className="rounded-[30px] border border-white/70 bg-white/80 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <i className={`${item.iconClass} text-lg`} aria-hidden="true" />
              </div>
              <h2 className="mt-5 text-xl font-semibold text-slate-950">{item.title}</h2>
              <p className="mt-3 leading-7 text-slate-600">{item.body}</p>
            </MotionDiv>
          ))}
        </section>

        <section className="rounded-[36px] border border-slate-200 bg-slate-950 px-8 py-10 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
          <SectionHeading
            eyebrow="Built for doctors"
            title="Start with a deployable web foundation, then connect your CUDA inference service."
            description="The first website version already includes a real dashboard, individual account flow, and case-review experience."
            invert
          />
          <div className="mt-8 flex flex-wrap gap-4">
            <Button asChild size="lg" variant="secondary">
              <Link href="/login">Enter doctor sign in</Link>
            </Button>
            <Button asChild size="lg" variant="ghost-light">
              <Link href="/register">Create account</Link>
            </Button>
          </div>
        </section>
      </section>
    </main>
  );
}
