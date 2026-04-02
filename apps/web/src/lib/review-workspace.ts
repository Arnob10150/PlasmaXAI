export type ReviewChecklistLane = "Microscopy" | "Correlation" | "Finalize";

export interface ReviewChecklistItem {
  id: string;
  text: string;
  done: boolean;
  lane: ReviewChecklistLane;
}

export interface ReportDraft {
  clinicalSummary: string;
  morphologySummary: string;
  recommendation: string;
  finalized: boolean;
  finalizedAt: string | null;
  updatedAt: string | null;
}

export function buildDefaultReviewChecklist(topFeatures: string[] = []): ReviewChecklistItem[] {
  const cueText = topFeatures.length
    ? `Confirm whether ${topFeatures.slice(0, 2).join(" and ")} match the dominant microscopy field.`
    : "Confirm that the highlighted focus-map region matches the dominant microscopy field.";

  return [
    { id: "review-1", text: "Inspect nuclear contour, chromatin density, and cytoplasmic proportion in the highlighted cell.", done: false, lane: "Microscopy" },
    { id: "review-2", text: cueText, done: false, lane: "Microscopy" },
    { id: "corr-1", text: "Correlate the current morphology with prior smear or marrow findings if available.", done: false, lane: "Correlation" },
    { id: "corr-2", text: "Document whether the AI-supported impression agrees with direct microscopy review.", done: false, lane: "Correlation" },
    { id: "final-1", text: "Finalize the report once the review summary and recommendation are satisfactory.", done: false, lane: "Finalize" },
  ];
}

export function buildDefaultReportDraft(input: {
  predictedClass?: string | null;
  confidence?: number | null;
  topFeatures?: string[];
  doctorInsight?: string | null;
  recommendedAction?: string | null;
}): ReportDraft {
  const confidenceText =
    typeof input.confidence === "number" ? `${(input.confidence * 100).toFixed(1)}%` : "pending confidence";
  const cues = input.topFeatures?.length ? input.topFeatures.slice(0, 3).join(", ") : "the dominant morphology cues";

  return {
    clinicalSummary:
      input.doctorInsight?.trim() ||
      `${input.predictedClass ?? "The current case"} is supported with ${confidenceText} diagnostic confidence based on the present review pattern.`,
    morphologySummary: `Most relevant review cues include ${cues}. Correlate these findings directly with the highlighted microscopy region before sign-out.`,
    recommendation:
      input.recommendedAction?.trim() ||
      "Use the AI output as decision support during smear correlation, then finalize the report after direct microscopy review.",
    finalized: false,
    finalizedAt: null,
    updatedAt: null,
  };
}

export function normalizeReviewChecklist(value: unknown, fallbackTopFeatures: string[] = []): ReviewChecklistItem[] {
  if (!Array.isArray(value) || !value.length) {
    return buildDefaultReviewChecklist(fallbackTopFeatures);
  }

  const allowedLanes: ReviewChecklistLane[] = ["Microscopy", "Correlation", "Finalize"];

  return value
    .map((item, index) => {
      const record = item as Partial<ReviewChecklistItem>;
      const lane = allowedLanes.includes(record.lane as ReviewChecklistLane)
        ? (record.lane as ReviewChecklistLane)
        : index < 2
          ? "Microscopy"
          : index < 4
            ? "Correlation"
            : "Finalize";

      return {
        id: typeof record.id === "string" && record.id ? record.id : `item-${index + 1}`,
        text:
          typeof record.text === "string" && record.text.trim()
            ? record.text.trim()
            : buildDefaultReviewChecklist(fallbackTopFeatures)[index]?.text ?? "Review item",
        done: Boolean(record.done),
        lane,
      };
    })
    .filter((item) => item.text.length > 0);
}

export function normalizeReportDraft(value: unknown, fallback: ReportDraft): ReportDraft {
  const record = (value ?? {}) as Partial<ReportDraft>;

  return {
    clinicalSummary:
      typeof record.clinicalSummary === "string" && record.clinicalSummary.trim()
        ? record.clinicalSummary.trim()
        : fallback.clinicalSummary,
    morphologySummary:
      typeof record.morphologySummary === "string" && record.morphologySummary.trim()
        ? record.morphologySummary.trim()
        : fallback.morphologySummary,
    recommendation:
      typeof record.recommendation === "string" && record.recommendation.trim()
        ? record.recommendation.trim()
        : fallback.recommendation,
    finalized: Boolean(record.finalized),
    finalizedAt:
      typeof record.finalizedAt === "string" && record.finalizedAt.trim()
        ? record.finalizedAt
        : fallback.finalizedAt,
    updatedAt:
      typeof record.updatedAt === "string" && record.updatedAt.trim()
        ? record.updatedAt
        : fallback.updatedAt,
  };
}
