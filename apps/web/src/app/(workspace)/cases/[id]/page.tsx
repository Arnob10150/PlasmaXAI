import { notFound } from "next/navigation";
import { deleteCaseAction, updateCaseReviewAction } from "@/app/(workspace)/cases/[id]/actions";
import { CaseAnalysisDashboard } from "@/components/cases/case-analysis-dashboard";
import { ImageReviewPanel } from "@/components/cases/image-review-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildClinicalChecklist,
  buildDoctorFacingCounterfactual,
  buildDoctorFacingInsight,
  buildMorphologyFindings,
  formatClinicalFeatureLabel,
} from "@/lib/clinical-explainability";
import {
  formatCaseDate,
  formatConfidence,
  getCaseDetail,
  getPatientDetail,
  getRiskTone,
  getStatusTone,
} from "@/lib/supabase/workspace-data";

function buildRecommendedAction(riskLevel?: string | null, confidence?: number | null) {
  const risk = (riskLevel ?? "").toLowerCase();

  if (risk === "high" || (confidence ?? 0) >= 0.9) {
    return "Prioritize smear and marrow correlation, review the focus map against the dominant abnormal area, and confirm with ancillary studies if clinically indicated.";
  }

  if (risk === "moderate" || (confidence ?? 0) >= 0.75) {
    return "Compare with prior morphology, use the focus map as supportive localization, and consider second-reader review if the clinical picture remains borderline.";
  }

  return "Use the AI findings as supportive documentation during routine microscopy review and retain the case for interval comparison.";
}

function buildRiskScore(caseItem: Awaited<ReturnType<typeof getCaseDetail>>) {
  if (!caseItem?.prediction) {
    return 0;
  }

  const probability = caseItem.analysis?.probabilities?.plasmaxai;
  if (typeof probability === "number") {
    return probability;
  }

  return caseItem.prediction.predictedClass.toLowerCase().includes("benign")
    ? 1 - caseItem.prediction.confidence
    : caseItem.prediction.confidence;
}

function buildIntervalComment(current: Awaited<ReturnType<typeof getCaseDetail>>, previous?: Awaited<ReturnType<typeof getCaseDetail>> | null) {
  if (!current?.prediction) {
    return "AI review will add interval context after the case completes inference.";
  }

  if (!previous?.prediction) {
    return "This is the first recorded reviewed case for this patient, so no prior interval comparison is available yet.";
  }

  const currentScore = buildRiskScore(current);
  const previousScore = buildRiskScore(previous);
  const delta = (currentScore - previousScore) * 100;
  const magnitude = Math.abs(delta).toFixed(1);

  if (delta > 5) {
    return `Compared with the previous case, the current review shows a ${magnitude}-point increase in suspicion support. Recheck whether the stronger cues are reproducible across adjacent fields before sign-out.`;
  }

  if (delta < -5) {
    return `Compared with the previous case, the current review shows a ${magnitude}-point reduction in suspicion support. Correlate with treatment interval and the underlying smear context before concluding interval improvement.`;
  }

  return "The current review sits close to the prior case, suggesting relative stability in the observed morphology pattern across the patient timeline.";
}

export default async function CaseReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caseItem = await getCaseDetail(id);

  if (!caseItem) {
    notFound();
  }

  const patientDetail = caseItem.patient ? await getPatientDetail(caseItem.patient.id) : null;
  const timeline = (patientDetail?.cases ?? [])
    .slice()
    .reverse()
    .map((item) => ({
      label: item.caseCode,
      confidence: item.prediction?.confidence ?? 0,
      riskScore: buildRiskScore(item),
      caseCode: item.caseCode,
    }))
    .slice(-6);

  const previousCase = patientDetail?.cases.find((item) => item.id !== caseItem.id) ?? null;
  const doctorInsight = buildDoctorFacingInsight({
    predictedClass: caseItem.prediction?.predictedClass ?? null,
    confidence: caseItem.prediction?.confidence ?? null,
    riskLevel: caseItem.prediction?.riskLevel ?? null,
    topFeatures: caseItem.explanation?.topFeatures ?? [],
    morphology: caseItem.analysis?.morphology ?? null,
    clinicalInsightText: caseItem.explanation?.clinicalInsightText ?? null,
  });
  const counterfactualNote = buildDoctorFacingCounterfactual({
    predictedClass: caseItem.prediction?.predictedClass ?? null,
    confidence: caseItem.prediction?.confidence ?? null,
    riskLevel: caseItem.prediction?.riskLevel ?? null,
    topFeatures: caseItem.explanation?.topFeatures ?? [],
    morphology: caseItem.analysis?.morphology ?? null,
    counterfactualText: caseItem.explanation?.counterfactualText ?? null,
  });
  const morphologyFindings = buildMorphologyFindings({
    predictedClass: caseItem.prediction?.predictedClass ?? null,
    confidence: caseItem.prediction?.confidence ?? null,
    riskLevel: caseItem.prediction?.riskLevel ?? null,
    topFeatures: caseItem.explanation?.topFeatures ?? [],
    morphology: caseItem.analysis?.morphology ?? null,
  });
  const clinicalChecklist = buildClinicalChecklist({
    predictedClass: caseItem.prediction?.predictedClass ?? null,
    confidence: caseItem.prediction?.confidence ?? null,
    riskLevel: caseItem.prediction?.riskLevel ?? null,
    topFeatures: caseItem.explanation?.topFeatures ?? [],
    morphology: caseItem.analysis?.morphology ?? null,
  });
  const intervalComment = buildIntervalComment(caseItem, previousCase);
  const image = caseItem.images[0] ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-blue-700">
            <i className="bi bi-clipboard2-pulse text-base" aria-hidden="true" />
            Hematology case review
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
            {caseItem.patient?.code ?? "Patient"} - {caseItem.caseCode}
          </h1>
          <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
            Review the smear image, examine the focus map and explainability cues, and document the final clinical decision.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={getRiskTone(caseItem.prediction?.riskLevel)}>
            {caseItem.prediction?.riskLevel ? `${caseItem.prediction.riskLevel} suspicion` : "Analysis pending"}
          </Badge>
          <Badge variant={getStatusTone(caseItem.status)}>{caseItem.status.replaceAll("_", " ")}</Badge>
          {caseItem.patient ? <Badge variant="info">{caseItem.patient.code}</Badge> : null}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_370px]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          {image?.signedUrl ? (
            <ImageReviewPanel
              imageName={image.fileName}
              imageUrl={image.signedUrl}
              heatmapUrl={caseItem.explanation?.heatmapPath ?? null}
              riskLevel={caseItem.prediction?.riskLevel ?? null}
              topFeatures={caseItem.explanation?.topFeatures ?? []}
            />
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
              No previewable image is available for this case yet.
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-700">Predicted class</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {caseItem.prediction?.predictedClass ?? "Awaiting analysis"}
              </p>
            </div>
            <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-700">Diagnostic confidence</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {formatConfidence(caseItem.prediction?.confidence ?? null)}
              </p>
            </div>
          </div>

          <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
            <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-900">
              <i className="bi bi-journal-medical text-sm text-blue-700" aria-hidden="true" />
              Clinical interpretation
            </p>
            <p className="mt-3 text-sm leading-7 text-slate-600">{doctorInsight}</p>
          </div>

          <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
            <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-900">
              <i className="bi bi-arrow-left-right text-sm text-emerald-700" aria-hidden="true" />
              What would lower suspicion
            </p>
            <p className="mt-3 text-sm leading-7 text-slate-600">{counterfactualNote}</p>
          </div>

          <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
            <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-900">
              <i className="bi bi-clipboard2-check text-sm text-amber-600" aria-hidden="true" />
              Recommended correlation
            </p>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              {buildRecommendedAction(caseItem.prediction?.riskLevel, caseItem.prediction?.confidence)}
            </p>
          </div>

          <form action={updateCaseReviewAction} className="space-y-4 rounded-[22px] border border-slate-200 bg-slate-50 p-4">
            <input type="hidden" name="caseId" value={caseItem.id} />
            <input type="hidden" name="redirectTo" value="/history" />
            <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-950">
              <i className="bi bi-person-workspace text-base text-blue-700" aria-hidden="true" />
              Doctor notes and disposition
            </h3>

            <div>
              <label className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <i className="bi bi-card-heading text-sm text-blue-700" aria-hidden="true" />
                Case title
              </label>
              <input
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4"
                defaultValue={caseItem.title}
                name="title"
              />
            </div>

            <div>
              <label className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <i className="bi bi-ui-checks-grid text-sm text-blue-700" aria-hidden="true" />
                Review status
              </label>
              <select name="status" defaultValue={caseItem.status} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4">
                <option value="new">New</option>
                <option value="reviewed">Reviewed</option>
                <option value="needs_second_review">Needs second review</option>
                <option value="follow_up_required">Follow-up required</option>
                <option value="report_ready">Report ready</option>
              </select>
            </div>

            <div>
              <label className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <i className="bi bi-journal-text text-sm text-blue-700" aria-hidden="true" />
                Doctor notes
              </label>
              <textarea
                name="notes"
                className="min-h-36 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3"
                defaultValue={caseItem.notes ?? ""}
              />
            </div>

            <div className="rounded-[20px] border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
              <p>
                Patient: <span className="font-medium text-slate-950">{caseItem.patient?.code ?? "Unassigned"}</span>
              </p>
              <p className="mt-2">
                Case title: <span className="font-medium text-slate-950">{caseItem.title}</span>
              </p>
              <p className="mt-2">
                Last reviewed: <span className="font-medium text-slate-950">{formatCaseDate(caseItem.reviewedAt)}</span>
              </p>
            </div>

            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Button type="submit">
                  <i className="bi bi-save2-fill text-sm" aria-hidden="true" />
                  Save review updates
                </Button>
                <Button className="w-full" formAction={deleteCaseAction} type="submit" variant="secondary">
                  <i className="bi bi-trash3-fill text-sm" aria-hidden="true" />
                  Delete case
                </Button>
              </div>
              {caseItem.prediction ? (
                <a
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                  href={caseItem.reports[0]?.signedUrl ?? `/api/local-report-file/${caseItem.id}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  <i className="bi bi-file-earmark-arrow-down-fill text-sm" aria-hidden="true" />
                  Download clinical report
                </a>
              ) : (
                <Button type="button" variant="secondary" className="w-full" disabled>
                  <i className="bi bi-hourglass-split text-sm" aria-hidden="true" />
                  Report will appear after analysis
                </Button>
              )}
            </div>
          </form>
        </section>
      </div>

      <CaseAnalysisDashboard
        confidence={caseItem.prediction?.confidence ?? null}
        interpretiveNote={doctorInsight}
        intervalComment={intervalComment}
        modalityGates={caseItem.analysis?.modalityGates ?? null}
        morphology={caseItem.analysis?.morphology ?? null}
        predictedClass={caseItem.prediction?.predictedClass ?? null}
        probabilities={caseItem.analysis?.probabilities ?? null}
        recommendedAction={buildRecommendedAction(caseItem.prediction?.riskLevel, caseItem.prediction?.confidence)}
        riskLevel={caseItem.prediction?.riskLevel ?? null}
        timeline={timeline}
        topFeatures={caseItem.explanation?.topFeatures ?? []}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-950">
            <i className="bi bi-bezier2 text-base text-blue-700" aria-hidden="true" />
            Explainable review cues
          </h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {(caseItem.explanation?.topFeatures ?? []).length ? (
              (caseItem.explanation?.topFeatures ?? []).map((feature) => (
                <span key={feature} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  {formatClinicalFeatureLabel(feature)}
                </span>
              ))
            ) : (
              <span className="text-sm text-slate-500">Case-specific cues will appear after analysis.</span>
            )}
          </div>
          <ul className="mt-4 space-y-2 text-sm leading-7 text-slate-600">
            {morphologyFindings.map((finding) => (
              <li key={finding} className="flex gap-2">
                <span className="mt-1 text-blue-700">-</span>
                <span>{finding}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-950">
            <i className="bi bi-clipboard-heart text-base text-blue-700" aria-hidden="true" />
            Doctor review checklist
          </h3>
          <ul className="mt-4 space-y-2 text-sm leading-7 text-slate-600">
            {clinicalChecklist.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1 text-blue-700">-</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
