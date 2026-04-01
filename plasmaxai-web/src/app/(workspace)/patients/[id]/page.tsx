import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatCaseDate,
  formatConfidence,
  getPatientDetail,
  getRiskTone,
  getStatusTone,
} from "@/lib/supabase/workspace-data";

function formatDelta(current?: number | null, previous?: number | null) {
  if (typeof current !== "number" || typeof previous !== "number") {
    return "Awaiting enough inferred cases";
  }

  const delta = (current - previous) * 100;
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${delta.toFixed(2)} pts vs previous case`;
}

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getPatientDetail(id);

  if (!detail) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.22em] text-blue-700">
            <i className="bi bi-person-lines-fill text-base" aria-hidden="true" />
            Patient profile
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            {detail.patient.code}
            {detail.patient.name ? ` · ${detail.patient.name}` : ""}
          </h1>
          <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
            Review this patient’s complete PlasmaXAI case timeline, compare the latest inferred case to the previous visit, and reopen any report or case workspace directly.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="info">{detail.cases.length} total cases</Badge>
          <Badge variant="danger">{detail.highRiskCount} high-risk</Badge>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <i className="bi bi-file-medical-fill text-base text-blue-700" aria-hidden="true" />
            Latest case
          </div>
          <p className="mt-3 text-2xl font-semibold text-slate-950">{detail.latestCase.caseCode}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{detail.latestCase.title}</p>
        </div>
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <i className="bi bi-speedometer2 text-base text-blue-700" aria-hidden="true" />
            Average confidence
          </div>
          <p className="mt-3 text-2xl font-semibold text-slate-950">{formatConfidence(detail.averageConfidence)}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">Across inferred cases for this patient</p>
        </div>
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <i className="bi bi-shield-fill-exclamation text-base text-blue-700" aria-hidden="true" />
            Latest risk
          </div>
          <div className="mt-3">
            <Badge variant={getRiskTone(detail.latestCase.prediction?.riskLevel)}>
              {detail.latestCase.prediction?.riskLevel ?? "Pending"}
            </Badge>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">Status {detail.latestCase.status.replaceAll("_", " ")}</p>
        </div>
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <i className="bi bi-graph-up-arrow text-base text-blue-700" aria-hidden="true" />
            Trend vs previous
          </div>
          <p className="mt-3 text-2xl font-semibold text-slate-950">
            {formatDelta(detail.latestCase.prediction?.confidence, detail.previousCase?.prediction?.confidence)}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">Confidence delta from the immediately previous case</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                <i className="bi bi-columns-gap text-base text-blue-700" aria-hidden="true" />
                Latest vs previous comparison
              </div>
              <p className="text-sm text-slate-500">Quick longitudinal comparison for doctor review</p>
            </div>
            <Button href={`/cases/${detail.latestCase.id}`} variant="secondary" size="sm">
              <i className="bi bi-box-arrow-up-right text-base" aria-hidden="true" />
              Open latest case
            </Button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {[detail.latestCase, detail.previousCase].map((item, index) => (
              <div key={item?.id ?? `empty-${index}`} className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                {item ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-slate-500">{index === 0 ? "Latest case" : "Previous case"}</p>
                        <h3 className="mt-2 text-xl font-semibold text-slate-950">{item.caseCode}</h3>
                      </div>
                      <Badge variant={getStatusTone(item.status)}>{item.status.replaceAll("_", " ")}</Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{item.title}</p>
                    <div className="mt-4 space-y-2 text-sm text-slate-600">
                      <p>Saved {formatCaseDate(item.createdAt)}</p>
                      <p>Confidence {formatConfidence(item.prediction?.confidence)}</p>
                      <p>Prediction {item.prediction?.predictedClass ?? "Pending inference"}</p>
                      <p>Risk {item.prediction?.riskLevel ?? "Pending"}</p>
                    </div>
                    <Link href={`/cases/${item.id}`} className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-blue-700 transition hover:text-blue-800">
                      <i className="bi bi-arrow-right-circle-fill text-base" aria-hidden="true" />
                      Open case workspace
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate-500">Previous case</p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-950">Not available yet</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      Add one more case for this patient to unlock side-by-side longitudinal comparison.
                    </p>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <i className="bi bi-diagram-3-fill text-base text-blue-700" aria-hidden="true" />
            Clinical timeline
          </div>
          <p className="mt-1 text-sm text-slate-500">Ordered newest to oldest for fast review</p>
          <div className="mt-5 space-y-4">
            {detail.cases.map((item, index) => (
              <div key={item.id} className="relative rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                {index !== detail.cases.length - 1 ? (
                  <div className="absolute left-8 top-full h-4 w-px bg-slate-200" />
                ) : null}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-slate-950">{item.caseCode}</p>
                      <Badge variant={getStatusTone(item.status)}>{item.status.replaceAll("_", " ")}</Badge>
                      <Badge variant={getRiskTone(item.prediction?.riskLevel)}>{item.prediction?.riskLevel ?? "Pending"}</Badge>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.title}</p>
                    <p className="mt-2 text-sm text-slate-500">Saved {formatCaseDate(item.createdAt)}</p>
                    <p className="mt-2 text-sm text-slate-500">Confidence {formatConfidence(item.prediction?.confidence)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-3">
                    <Button href={`/cases/${item.id}`} variant="secondary" size="sm">
                      <i className="bi bi-box-arrow-up-right text-base" aria-hidden="true" />
                      Open
                    </Button>
                    {item.reports[0] ? (
                      <a
                        className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 transition hover:text-blue-800"
                        href={item.reports[0].signedUrl ?? item.reports[0].storagePath}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <i className="bi bi-file-earmark-pdf-fill text-base" aria-hidden="true" />
                        Report
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}