import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="sticky bottom-0 z-30 border-t border-slate-800/80 bg-slate-950 text-white shadow-[0_-24px_60px_rgba(15,23,42,0.22)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 lg:flex-row lg:items-end lg:justify-between lg:px-10">
        <div className="max-w-2xl">
          <p className="text-base font-semibold tracking-[0.2em] text-blue-200">PLASMAXAI</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Clinical review workspace for hematology teams.
          </h2>
          <p className="mt-3 text-base leading-8 text-slate-300">
            Built for microscopy review, explainable plasma-cell assessment, and clinician-ready reporting.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-base">
          <Link
            href="/about"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-5 py-3 font-medium text-white transition hover:-translate-y-0.5 hover:bg-white/14"
          >
            <i className="bi bi-info-circle-fill text-base text-blue-200" aria-hidden="true" />
            About
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-5 py-3 font-medium text-white transition hover:-translate-y-0.5 hover:bg-white/14"
          >
            <i className="bi bi-geo-alt-fill text-base text-blue-200" aria-hidden="true" />
            Contact
          </Link>
        </div>

        <div className="flex flex-col text-sm leading-6 text-slate-300 lg:items-end">
          <p className="inline-flex items-center gap-2">
            <i className="bi bi-buildings-fill text-sm text-blue-200" aria-hidden="true" />
            Dhaka, Bangladesh
          </p>
          <p>&copy; 2026 PlasmaXAI Clinical Review Workspace</p>
        </div>
      </div>
    </footer>
  );
}
