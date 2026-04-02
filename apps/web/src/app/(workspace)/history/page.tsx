import Link from "next/link";
import { deleteCaseAction } from "@/app/(workspace)/cases/[id]/actions";
import { Badge } from "@/components/ui/badge";
import {
  formatCaseDate,
  formatConfidence,
  getCaseHistoryData,
  getRiskTone,
  getStatusTone,
} from "@/lib/supabase/workspace-data";

export default async function HistoryPage() {
  const rows = await getCaseHistoryData();

  return (
    <div className="space-y-6">
      <div>
        <p className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.22em] text-blue-700">
          <i className="bi bi-clock-history text-base" aria-hidden="true" />
          Saved history
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Case archive</h1>
        <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
          Reopen, edit, download, or remove prior PlasmaXAI cases from one doctor-facing archive.
        </p>
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-wrap gap-2">
          <Badge variant="neutral">
            <span className="inline-flex items-center gap-2">
              <i className="bi bi-collection-fill text-sm" aria-hidden="true" />
              All saved cases
            </span>
          </Badge>
          <Badge variant="info">
            <span className="inline-flex items-center gap-2">
              <i className="bi bi-file-earmark-check-fill text-sm" aria-hidden="true" />
              Report archive
            </span>
          </Badge>
          <Badge variant="danger">
            <span className="inline-flex items-center gap-2">
              <i className="bi bi-exclamation-diamond-fill text-sm" aria-hidden="true" />
              High suspicion cases
            </span>
          </Badge>
          <Badge variant="success">
            <span className="inline-flex items-center gap-2">
              <i className="bi bi-check2-circle text-sm" aria-hidden="true" />
              Reviewed cases
            </span>
          </Badge>
        </div>

        {rows.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <div key={row.id} className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="inline-flex items-center gap-2 text-sm text-slate-500">
                      <i className="bi bi-folder2-open text-base text-blue-700" aria-hidden="true" />
                      {row.caseCode}
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-slate-950">{row.title}</h2>
                  </div>
                  <Badge variant={getStatusTone(row.status)}>{row.status.replaceAll("_", " ")}</Badge>
                </div>

                <div className="mt-4 space-y-2 text-sm text-slate-600">
                  <p className="inline-flex items-center gap-2">
                    <i className="bi bi-person-vcard-fill text-sm text-blue-700" aria-hidden="true" />
                    Patient {row.patient?.code ?? "Unassigned"}
                  </p>
                  <p className="inline-flex items-center gap-2">
                    <i className="bi bi-activity text-sm text-blue-700" aria-hidden="true" />
                    Confidence {formatConfidence(row.prediction?.confidence)}
                  </p>
                  <p className="inline-flex items-center gap-2">
                    <i className="bi bi-calendar3 text-sm text-blue-700" aria-hidden="true" />
                    Saved {formatCaseDate(row.createdAt)}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge variant={getRiskTone(row.prediction?.riskLevel)}>
                    {row.prediction?.riskLevel ?? "Awaiting analysis"}
                  </Badge>
                  {row.reports[0] ? <Badge variant="info">Report available</Badge> : null}
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href={`/cases/${row.id}`}
                    className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 transition hover:text-blue-800"
                  >
                    <i className="bi bi-pencil-square text-sm" aria-hidden="true" />
                    Open and edit
                  </Link>
                  {row.reports[0] ? (
                    <a
                      href={row.reports[0].signedUrl ?? row.reports[0].storagePath}
                      className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 transition hover:text-slate-950"
                      rel="noreferrer"
                      target="_blank"
                    >
                      <i className="bi bi-file-earmark-arrow-down-fill text-sm" aria-hidden="true" />
                      Report
                    </a>
                  ) : null}
                </div>

                <form action={deleteCaseAction} className="mt-4">
                  <input type="hidden" name="caseId" value={row.id} />
                  <input type="hidden" name="redirectTo" value="/history" />
                  <button
                    className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
                    type="submit"
                  >
                    <i className="bi bi-trash3-fill text-sm" aria-hidden="true" />
                    Delete case
                  </button>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
            <p className="text-lg font-semibold text-slate-950">No saved history yet</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Once you create a case, it will appear here for quick reopening, report access, and longitudinal review.
            </p>
            <Link href="/new-case" className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800">
              <i className="bi bi-file-earmark-medical-fill text-sm" aria-hidden="true" />
              Create first case
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
