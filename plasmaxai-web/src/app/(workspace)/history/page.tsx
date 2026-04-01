import Link from "next/link";
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
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Case history</h1>
        <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
          Search, filter, and reopen previous PlasmaXAI analyses from the logged-in doctor account.
        </p>
      </div>
      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-wrap gap-2">
          <Badge variant="neutral">
            <span className="inline-flex items-center gap-2">
              <i className="bi bi-collection-fill text-sm" aria-hidden="true" />
              All cases
            </span>
          </Badge>
          <Badge variant="warning">
            <span className="inline-flex items-center gap-2">
              <i className="bi bi-hourglass-split text-sm" aria-hidden="true" />
              Pending review
            </span>
          </Badge>
          <Badge variant="danger">
            <span className="inline-flex items-center gap-2">
              <i className="bi bi-exclamation-diamond-fill text-sm" aria-hidden="true" />
              High suspicion
            </span>
          </Badge>
          <Badge variant="success">
            <span className="inline-flex items-center gap-2">
              <i className="bi bi-check2-circle text-sm" aria-hidden="true" />
              Reviewed
            </span>
          </Badge>
        </div>
        {rows.length ? (
          <div className="overflow-hidden rounded-[24px] border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Case ID</th>
                  <th className="px-4 py-3 font-medium">Patient</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Confidence</th>
                  <th className="px-4 py-3 font-medium">Saved</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-4 py-4 text-slate-700">
                      <Link href={`/cases/${row.id}`} className="inline-flex items-center gap-2 font-semibold text-slate-950 transition hover:text-blue-700">
                        <i className="bi bi-folder2-open text-sm text-blue-700" aria-hidden="true" />
                        {row.caseCode}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-slate-700">{row.patient?.code ?? "Unassigned"}</td>
                    <td className="px-4 py-4 text-slate-700">
                      <div className="flex gap-2">
                        <Badge variant={getStatusTone(row.status)}>{row.status.replaceAll("_", " ")}</Badge>
                        <Badge variant={getRiskTone(row.prediction?.riskLevel)}>{row.prediction?.riskLevel ?? "Pending"}</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-700">{formatConfidence(row.prediction?.confidence)}</td>
                    <td className="px-4 py-4 text-slate-700">{formatCaseDate(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
            <p className="text-lg font-semibold text-slate-950">No saved history yet</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Once you create a case, it will appear here for quick reopening and longitudinal review.
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
