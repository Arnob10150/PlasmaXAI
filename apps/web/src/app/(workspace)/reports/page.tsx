import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatCaseDate, getReportsData } from "@/lib/supabase/workspace-data";

export default async function ReportsPage() {
  const reports = await getReportsData();

  return (
    <div className="space-y-6">
      <div>
        <p className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.22em] text-blue-700">
          <i className="bi bi-file-earmark-pdf-fill text-base" aria-hidden="true" />
          Reports
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Generated reports</h1>
        <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
          Manage downloadable report artifacts, reopen clinical summaries, and keep a traceable case archive for doctor workflows.
        </p>
      </div>
      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
        {reports.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {reports.map((report) => (
              <div key={report.id} className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="inline-flex items-center gap-2 text-sm text-slate-500">
                      <i className="bi bi-filetype-pdf text-base text-blue-700" aria-hidden="true" />
                      {report.reportType.toUpperCase()} ready
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-slate-950">{report.title}</h2>
                  </div>
                  <Badge variant="success">
                    <span className="inline-flex items-center gap-2">
                      <i className="bi bi-check2-circle text-sm" aria-hidden="true" />
                      Ready
                    </span>
                  </Badge>
                </div>
                <p className="mt-3 inline-flex items-center gap-2 text-sm leading-6 text-slate-600">
                  <i className="bi bi-person-vcard-fill text-sm text-blue-700" aria-hidden="true" />
                  Patient {report.patientCode}{report.patientName ? ` · ${report.patientName}` : ""}
                </p>
                <p className="mt-2 inline-flex items-center gap-2 text-sm leading-6 text-slate-500">
                  <i className="bi bi-calendar3 text-sm" aria-hidden="true" />
                  Generated {formatCaseDate(report.generatedAt)}
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link href={`/cases/${report.caseId}`} className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 transition hover:text-blue-800">
                    <i className="bi bi-folder2-open text-sm" aria-hidden="true" />
                    Open case
                  </Link>
                  <a href={report.signedUrl ?? report.storagePath} className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 transition hover:text-slate-950" target="_blank" rel="noreferrer">
                    <i className="bi bi-box-arrow-up-right text-sm" aria-hidden="true" />
                    Open report
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
            <p className="text-lg font-semibold text-slate-950">No reports generated yet</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Reports will appear here once a case completes inference successfully.
            </p>
            <Link href="/history" className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800">
              <i className="bi bi-clock-history text-sm" aria-hidden="true" />
              Review saved cases
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
