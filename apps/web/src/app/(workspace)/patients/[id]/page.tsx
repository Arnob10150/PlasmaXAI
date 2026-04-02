import Link from "next/link";
import { notFound } from "next/navigation";
import {
  deletePatientAction,
  updatePatientAction,
} from "@/app/(workspace)/patients/actions";
import { ReportDownloadButton } from "@/components/cases/report-download-button";
import { PatientProfileForm } from "@/components/patients/patient-profile-form";
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
          <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight text-slate-950">
            {detail.patient.code}
            {detail.patient.name ? ` - ${detail.patient.name}` : ""}
          </h1>
          <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
            Review this patient&apos;s case history, update patient details, and reopen any saved case workspace or report.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="info">{detail.cases.length} total cases</Badge>
          <Badge variant="danger">{detail.highRiskCount} high-risk</Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <i className="bi bi-file-medical-fill text-base text-blue-700" aria-hidden="true" />
            Latest case
          </div>
          <p className="mt-3 text-2xl font-semibold text-slate-950">{detail.latestCase?.caseCode ?? "No cases yet"}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{detail.latestCase?.title ?? "Create a case to begin the longitudinal review."}</p>
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
            <Badge variant={getRiskTone(detail.latestCase?.prediction?.riskLevel)}>
              {detail.latestCase?.prediction?.riskLevel ?? "Pending"}
            </Badge>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Status {detail.latestCase ? detail.latestCase.status.replaceAll("_", " ") : "Awaiting first case"}
          </p>
        </div>
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <i className="bi bi-graph-up-arrow text-base text-blue-700" aria-hidden="true" />
            Trend vs previous
          </div>
          <p className="mt-3 text-2xl font-semibold text-slate-950">
            {formatDelta(detail.latestCase?.prediction?.confidence, detail.previousCase?.prediction?.confidence)}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">Confidence delta from the immediately previous case</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="space-y-4">
            <PatientProfileForm
            deleteAction={deletePatientAction}
              patient={detail.patient}
              updateAction={updatePatientAction}
            />

          <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-lg font-semibold text-slate-950">
              <i className="bi bi-person-vcard-fill text-base text-blue-700" aria-hidden="true" />
              Patient identifiers
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p>Patient code</p>
                <p className="mt-2 font-semibold text-slate-950">{detail.patient.code}</p>
              </div>
              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p>Name</p>
                <p className="mt-2 font-semibold text-slate-950">{detail.patient.name ?? "Not recorded"}</p>
              </div>
              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p>Sex</p>
                <p className="mt-2 font-semibold text-slate-950">{detail.patient.sex ?? "Not recorded"}</p>
              </div>
              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p>Date of birth</p>
                <p className="mt-2 font-semibold text-slate-950">{detail.patient.dateOfBirth ?? "Not recorded"}</p>
              </div>
            </div>
          </section>
        </section>

        <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                <i className="bi bi-diagram-3-fill text-base text-blue-700" aria-hidden="true" />
                Clinical timeline
              </div>
              <p className="text-sm text-slate-500">Ordered newest to oldest for fast review</p>
            </div>
            <Button href="/new-case" size="sm" variant="secondary">
              <i className="bi bi-file-earmark-medical-fill text-base" aria-hidden="true" />
              New case
            </Button>
          </div>

          {detail.cases.length ? (
            <div className="mt-5 space-y-4">
              {detail.cases.map((item, index) => (
                <div key={item.id} className="relative rounded-[24px] border border-slate-200 bg-slate-50 p-4 sm:p-5">
                  {index !== detail.cases.length - 1 ? (
                    <div className="absolute left-8 top-full h-4 w-px bg-slate-200" />
                  ) : null}
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold text-slate-950">{item.caseCode}</p>
                        <Badge variant={getStatusTone(item.status)}>{item.status.replaceAll("_", " ")}</Badge>
                        <Badge variant={getRiskTone(item.prediction?.riskLevel)}>{item.prediction?.riskLevel ?? "Pending"}</Badge>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{item.title}</p>
                      <p className="mt-2 text-sm text-slate-500">Saved {formatCaseDate(item.createdAt)}</p>
                      <p className="mt-2 text-sm text-slate-500">Confidence {formatConfidence(item.prediction?.confidence)}</p>
                    </div>
                    <div className="flex flex-wrap gap-3 lg:flex-col lg:items-end">
                      <Button href={`/cases/${item.id}`} size="sm" variant="secondary">
                        <i className="bi bi-box-arrow-up-right text-base" aria-hidden="true" />
                        Open
                      </Button>
                      {item.reports[0] ? (
                        <ReportDownloadButton
                          caseId={item.id}
                          className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 transition hover:text-blue-800"
                          href={item.reports[0].signedUrl ?? item.reports[0].storagePath}
                          imageUrl={item.images[0]?.signedUrl ?? item.images[0]?.storagePath ?? null}
                        >
                          <i className="bi bi-file-earmark-pdf-fill text-base" aria-hidden="true" />
                          Report
                        </ReportDownloadButton>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
              <p className="text-lg font-semibold text-slate-950">No cases linked to this patient yet</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Use the new-case flow to add the first microscopy review for this patient.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

