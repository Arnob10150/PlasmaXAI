import { notFound } from "next/navigation";
import { updateCaseReviewAction } from "@/app/(workspace)/cases/[id]/actions";
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

const featureLabelMap: Record<string, string> = {
  "NC ratio": "elevated nuclear-to-cytoplasmic ratio",
  "Mean R intensity": "increased red-channel cytoplasmic intensity",
  "Mean B intensity": "blue-channel chromatic shift",
  "Mean G intensity": "green-channel intensity balance",
  "Nucleus area": "expanded nuclear area",
  "Cell circularity": "altered cell circularity",
  Perimeter: "irregular cell perimeter",
  "Cytoplasm area": "broader cytoplasmic spread",
  "Texture smoothness": "texture smoothness pattern",
};

function sentenceCase(value: string) {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function describeTopFeatures(features: string[]) {
  if (!features.length) {
    return "the dominant morphology program identified by the fused network";
  }

  return features
    .slice(0, 3)
    .map((feature) => featureLabelMap[feature] ?? sentenceCase(formatClinicalFeatureLabel(feature)))
    .join(", ");
}

function buildInterpretiveNote(caseItem: Awaited<ReturnType<typeof getCaseDetail>>) {
  if (!caseItem?.prediction) {
    return "PlasmaXAI analysis is still being prepared. Review the smear image first, then confirm the AI summary once the classification and evidence blocks populate.";
  }

  const featureSummary = describeTopFeatures(caseItem.explanation?.topFeatures ?? []);
  const confidenceText = formatConfidence(caseItem.prediction.confidence);
  const risk = caseItem.prediction.riskLevel.toLowerCase();

  if (risk === "high") {
    return `PlasmaXAI flags this cell as high suspicion for malignant plasma-cell morphology at ${confidenceText}. The fused signal is chiefly influenced by ${featureSummary}, which keeps the case away from the benign decision boundary.`;
  }

  if (risk === "moderate") {
    return `PlasmaXAI places this cell in an intermediate review zone at ${confidenceText}. The score remains above the review threshold, with the strongest pull coming from ${featureSummary}.`;
  }

  return `PlasmaXAI currently leans toward a low-suspicion interpretation at ${confidenceText}. The image still deserves routine correlation, but the dominant cues are closer to benign morphology than malignant reference patterns.`;
}

function buildRecommendedAction(caseItem: Awaited<ReturnType<typeof getCaseDetail>>) {
  if (!caseItem?.prediction) {
    return "Keep the case open for review, verify image quality, and correlate with the marrow smear and available clinical information once AI output completes.";
  }

  const risk = caseItem.prediction.riskLevel.toLowerCase();

  if (risk === "high") {
    return "Prioritize hematopathology review, correlate with plasma-cell burden on smear or marrow aspirate, and confirm with immunophenotyping or ancillary studies if clinically indicated.";
  }

  if (risk === "moderate") {
    return "Correlate with prior morphology, plasma-cell percentage, and laboratory findings. A second reader can be helpful if the image impression and clinical context are discordant.";
  }

  return "Routine sign-out correlation is appropriate. Retain the case in history for interval comparison if future marrow or smear samples are obtained.";
}

function buildIntervalComment(
  caseItem: Awaited<ReturnType<typeof getCaseDetail>>,
  patientDetail: Awaited<ReturnType<typeof getPatientDetail>>,
) {
  const comparisonCase =
    patientDetail?.cases.find((item) => item.id !== caseItem?.id) ?? null;

  if (!caseItem?.prediction) {
    return "No interval comparison is available until the current case finishes inference.";
  }

  if (!comparisonCase?.prediction) {
    return "This appears to be the first analyzed case for this patient, so no prior confidence curve is available yet.";
  }

  const delta = (caseItem.prediction.confidence - comparisonCase.prediction.confidence) * 100;
  const direction =
    delta > 2
      ? "strengthened"
      : delta < -2
        ? "softened"
        : "remained broadly stable";

  if (direction === "remained broadly stable") {
    return `Compared with ${comparisonCase.caseCode}, the AI signal has remained broadly stable, suggesting similar morphologic burden across the two recorded samples.`;
  }

  return `Compared with ${comparisonCase.caseCode}, the AI confidence has ${direction} by ${Math.abs(delta).toFixed(1)} percentage points, which may help when reviewing interval morphologic change.`;
}

function buildWhyFlaggedNote(caseItem: Awaited<ReturnType<typeof getCaseDetail>>) {
  if (!caseItem?.prediction) {
    return "The case has not been scored yet, so the AI has not identified its dominant morphology cues.";
  }

  const features = caseItem.explanation?.topFeatures ?? [];
  const featureSummary = describeTopFeatures(features);
  const risk = caseItem.prediction.riskLevel.toLowerCase();

  if (risk === "high") {
    return `The current image is being driven toward a high-suspicion interpretation by ${featureSummary}. These cues collectively keep the sample aligned with malignant plasma-cell morphology rather than a benign or low-suspicion pattern.`;
  }

  if (risk === "moderate") {
    return `The AI review stays in an intermediate band because ${featureSummary} still pull the image toward suspicious morphology, although the separation from the benign boundary is not extreme.`;
  }

  return `The image remains in a low-suspicion zone because the dominant visible cues are less concordant with malignant plasma-cell morphology and more compatible with a benign-leaning profile.`;
}

function buildCounterfactualGuidance(caseItem: Awaited<ReturnType<typeof getCaseDetail>>) {
  if (caseItem?.explanation?.counterfactualText) {
    return caseItem.explanation.counterfactualText;
  }

  if (!caseItem?.prediction) {
    return "Once inference completes, this section will describe what morphologic shift would move the case closer to a lower-suspicion interpretation.";
  }

  return "The AI expects that a reduction in the dominant abnormal cues would move this case toward the low-suspicion boundary. Use this as a review aid rather than as a substitute for microscopy correlation.";
}

function buildClinicalUseNote(caseItem: Awaited<ReturnType<typeof getCaseDetail>>) {
  if (!caseItem?.prediction) {
    return "Use the image viewer for morphology inspection first, then confirm the AI-supported interpretation once the case analysis is complete.";
  }

  const risk = caseItem.prediction.riskLevel.toLowerCase();

  if (risk === "high") {
    return "Treat this output as a high-priority review aid. Correlate with smear morphology, plasma-cell burden, and any available immunophenotypic data before final sign-out.";
  }

  if (risk === "moderate") {
    return "This output is most useful as a correlation prompt. Compare the image with prior cases and consider a second reader if the visual impression is borderline.";
  }

  return "This output can support routine review and documentation. Keep the case in the patient timeline so future interval change can be judged against the current low-suspicion baseline.";
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

  const hasPrediction = Boolean(caseItem.prediction);
  const image = caseItem.images[0] ?? null;
  const patientDetail = caseItem.patient ? await getPatientDetail(caseItem.patient.id) : null;
  const interpretiveNote = buildInterpretiveNote(caseItem);
  const recommendedAction = buildRecommendedAction(caseItem);
  const intervalComment = buildIntervalComment(caseItem, patientDetail);
  const whyFlaggedNote = buildWhyFlaggedNote(caseItem);
  const counterfactualGuidance = buildDoctorFacingCounterfactual({
    predictedClass: caseItem.prediction?.predictedClass,
    confidence: caseItem.prediction?.confidence,
    riskLevel: caseItem.prediction?.riskLevel,
    topFeatures: caseItem.explanation?.topFeatures ?? [],
    morphology: caseItem.analysis?.morphology ?? null,
    counterfactualText: buildCounterfactualGuidance(caseItem),
  });
  const clinicalUseNote = buildClinicalUseNote(caseItem);
  const morphologyFindings = buildMorphologyFindings({
    predictedClass: caseItem.prediction?.predictedClass,
    confidence: caseItem.prediction?.confidence,
    riskLevel: caseItem.prediction?.riskLevel,
    topFeatures: caseItem.explanation?.topFeatures ?? [],
    morphology: caseItem.analysis?.morphology ?? null,
  });
  const clinicalChecklist = buildClinicalChecklist({
    predictedClass: caseItem.prediction?.predictedClass,
    confidence: caseItem.prediction?.confidence,
    riskLevel: caseItem.prediction?.riskLevel,
    topFeatures: caseItem.explanation?.topFeatures ?? [],
    morphology: caseItem.analysis?.morphology ?? null,
  });
  const doctorFacingInsight = buildDoctorFacingInsight({
    predictedClass: caseItem.prediction?.predictedClass,
    confidence: caseItem.prediction?.confidence,
    riskLevel: caseItem.prediction?.riskLevel,
    topFeatures: caseItem.explanation?.topFeatures ?? [],
    morphology: caseItem.analysis?.morphology ?? null,
    clinicalInsightText: caseItem.explanation?.clinicalInsightText ?? null,
  });
  const timelineData =
    patientDetail?.cases
      .slice()
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
      .map((item) => ({
        label: new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        confidence: item.prediction?.confidence ?? 0,
        riskScore:
          item.prediction?.riskLevel?.toLowerCase() === "high"
            ? 0.95
            : item.prediction?.riskLevel?.toLowerCase() === "moderate"
              ? 0.65
              : item.prediction
                ? 0.35
                : 0,
        caseCode: item.caseCode,
      })) ?? [];

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
            Review the uploaded smear image, inspect the PlasmaXAI interpretation, and document the final hematopathology decision from one clinically oriented workspace.
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          {image?.signedUrl ? (
            <ImageReviewPanel
              imageUrl={image.signedUrl}
              imageName={image.fileName}
              imagePath={image.storagePath}
              heatmapUrl={caseItem.explanation?.heatmapPath ?? null}
              riskLevel={caseItem.prediction?.riskLevel ?? null}
              topFeatures={caseItem.explanation?.topFeatures ?? []}
            />
          ) : image ? (
            <div className="space-y-4">
              <div className="mb-1">
                <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-950">
                  <i className="bi bi-image-fill text-base text-blue-700" aria-hidden="true" />
                  Uploaded smear image
                </h2>
                <p className="text-sm text-slate-500">
                  A file reference is available, but the preview could not be rendered from storage.
                </p>
              </div>
              <div className="flex aspect-[4/3] items-center justify-center rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#f8fbff,#eef5fb)] p-6 text-center">
                <div>
                  <p className="text-lg font-semibold text-slate-950">{image.fileName}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{image.storagePath}</p>
                </div>
              </div>
              <p className="text-sm leading-6 text-slate-500">
                This case stores an image reference, but a live preview was not returned. If this should be a Supabase-hosted image, review the storage configuration.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-1">
                <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-950">
                  <i className="bi bi-image-fill text-base text-blue-700" aria-hidden="true" />
                  Uploaded smear image
                </h2>
                <p className="text-sm text-slate-500">
                  Attach a smear or marrow cell image to activate case-specific visual review.
                </p>
              </div>
              <div className="flex aspect-[4/3] items-center justify-center rounded-[28px] bg-[radial-gradient(circle_at_45%_35%,_rgba(248,113,113,0.75),_rgba(127,29,29,0.95)),linear-gradient(180deg,_#082f49,_#0f172a)]">
                <div className="grid h-[68%] w-[68%] place-items-center rounded-full border border-cyan-200/60 bg-cyan-200/12">
                  <div className="h-36 w-36 rounded-full border border-rose-200/70 bg-[radial-gradient(circle_at_40%_40%,_#fecdd3,_#9f1239)] shadow-[0_0_44px_rgba(244,63,94,0.38)]" />
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-500">
                No image is attached yet. Add a case image to generate the interpretive curve panels and case-specific explainability output.
              </p>
            </>
          )}
        </section>

        <CaseAnalysisDashboard
          predictedClass={hasPrediction ? caseItem.prediction?.predictedClass ?? null : null}
          confidence={caseItem.prediction?.confidence ?? null}
          riskLevel={caseItem.prediction?.riskLevel ?? null}
          probabilities={caseItem.analysis?.probabilities ?? null}
          modalityGates={caseItem.analysis?.modalityGates ?? null}
          morphology={caseItem.analysis?.morphology ?? null}
          topFeatures={caseItem.explanation?.topFeatures ?? []}
          interpretiveNote={interpretiveNote}
          recommendedAction={recommendedAction}
          intervalComment={intervalComment}
          timeline={timelineData}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-950">
              <i className="bi bi-bezier2 text-base text-blue-700" aria-hidden="true" />
              Explainable AI review
            </h3>
            <Badge variant="info">{(caseItem.explanation?.topFeatures ?? []).length || 0} drivers</Badge>
          </div>
          <p className="mt-3 text-sm leading-7 text-slate-500">
            These explanation blocks convert the PlasmaXAI output into morphology-focused review guidance for clinical correlation and sign-out support.
          </p>
          <div className="mt-4 space-y-4">
            <div className="rounded-[24px] bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-600">
              <p className="inline-flex items-center gap-2 font-medium text-slate-900">
                <i className="bi bi-search-heart text-sm text-blue-700" aria-hidden="true" />
                Why the case was flagged
              </p>
              <p className="mt-2">{whyFlaggedNote}</p>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-600">
              <p className="inline-flex items-center gap-2 font-medium text-slate-900">
                <i className="bi bi-arrow-left-right text-sm text-emerald-700" aria-hidden="true" />
                What would lower suspicion
              </p>
              <p className="mt-2">{counterfactualGuidance}</p>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-600">
              <p className="inline-flex items-center gap-2 font-medium text-slate-900">
                <i className="bi bi-diagram-2-fill text-sm text-violet-700" aria-hidden="true" />
                Key morphology cues
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(caseItem.explanation?.topFeatures ?? []).length ? (
                  (caseItem.explanation?.topFeatures ?? []).map((feature) => (
                    <span key={feature} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      {formatClinicalFeatureLabel(feature)}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">Key morphology cues will appear after case analysis is complete.</span>
                )}
              </div>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-600">
              <p className="inline-flex items-center gap-2 font-medium text-slate-900">
                <i className="bi bi-list-check text-sm text-amber-600" aria-hidden="true" />
                Morphology findings
              </p>
              <ul className="mt-3 space-y-2">
                {morphologyFindings.map((finding) => (
                  <li key={finding} className="flex gap-2">
                    <span className="mt-1 text-blue-700">-</span>
                    <span>{finding}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-950">
            <i className="bi bi-clipboard2-heart-fill text-base text-blue-700" aria-hidden="true" />
            Clinical correlation note
          </h3>
          <div className="mt-4 space-y-4 text-sm leading-7 text-slate-600">
            <div className="rounded-[24px] bg-slate-50 px-4 py-4">
              {doctorFacingInsight}
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
              <p className="inline-flex items-center gap-2 font-medium text-slate-900">
                <i className="bi bi-journal-medical text-sm text-emerald-700" aria-hidden="true" />
                Suggested correlation
              </p>
              <p className="mt-2">{recommendedAction}</p>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
              <p className="inline-flex items-center gap-2 font-medium text-slate-900">
                <i className="bi bi-shield-check text-sm text-blue-700" aria-hidden="true" />
                How to use this result
              </p>
              <p className="mt-2">{clinicalUseNote}</p>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
              <p className="inline-flex items-center gap-2 font-medium text-slate-900">
                <i className="bi bi-graph-up-arrow text-sm text-violet-700" aria-hidden="true" />
                Interval context
              </p>
              <p className="mt-2">{intervalComment}</p>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
              <p className="inline-flex items-center gap-2 font-medium text-slate-900">
                <i className="bi bi-clipboard-check text-sm text-amber-600" aria-hidden="true" />
                Review checklist
              </p>
              <ul className="mt-3 space-y-2">
                {clinicalChecklist.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1 text-blue-700">-</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="space-y-4 xl:col-span-1">
          <form action={updateCaseReviewAction} className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <input type="hidden" name="caseId" value={caseItem.id} />
            <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-950">
              <i className="bi bi-person-workspace text-base text-blue-700" aria-hidden="true" />
              Doctor notes and disposition
            </h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                  <i className="bi bi-ui-checks-grid text-sm text-blue-700" aria-hidden="true" />
                  Review status
                </label>
                <select name="status" defaultValue={caseItem.status} className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4">
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
                  className="min-h-36 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3"
                  defaultValue={caseItem.notes ?? ""}
                />
              </div>
              <div className="rounded-[24px] bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                <p className="inline-flex items-center gap-2">
                  <i className="bi bi-person-vcard-fill text-sm text-blue-700" aria-hidden="true" />
                  Patient: <span className="font-medium text-slate-950">{caseItem.patient?.code ?? "Unassigned"}</span>
                </p>
                <p className="mt-2 inline-flex items-center gap-2">
                  <i className="bi bi-file-earmark-medical-fill text-sm text-blue-700" aria-hidden="true" />
                  Title: <span className="font-medium text-slate-950">{caseItem.title}</span>
                </p>
                <p className="mt-2 inline-flex items-center gap-2">
                  <i className="bi bi-calendar3 text-sm text-blue-700" aria-hidden="true" />
                  Last reviewed: <span className="font-medium text-slate-950">{formatCaseDate(caseItem.reviewedAt)}</span>
                </p>
              </div>
              <div className="grid gap-3">
                <Button type="submit">
                  <i className="bi bi-save2-fill text-sm" aria-hidden="true" />
                  Save review updates
                </Button>
                {caseItem.reports[0] ? (
                  <a
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                    href={caseItem.reports[0].signedUrl ?? caseItem.reports[0].storagePath}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <i className="bi bi-file-earmark-arrow-down-fill text-sm" aria-hidden="true" />
                    Open report
                  </a>
                ) : (
                  <Button type="button" variant="secondary" className="w-full" disabled>
                    <i className="bi bi-hourglass-split text-sm" aria-hidden="true" />
                    Report will appear after analysis
                  </Button>
                )}
                {caseItem.patient ? (
                  <Button href={`/patients/${caseItem.patient.id}`} type="button" variant="secondary" className="w-full">
                    <i className="bi bi-person-lines-fill text-sm" aria-hidden="true" />
                    Open patient profile
                  </Button>
                ) : (
                  <Button href="/history" type="button" variant="secondary" className="w-full">
                    <i className="bi bi-clock-history text-sm" aria-hidden="true" />
                    Open saved history
                  </Button>
                )}
              </div>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
