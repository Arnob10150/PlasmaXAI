interface ClinicalExplainabilityInput {
  predictedClass?: string | null;
  confidence?: number | null;
  riskLevel?: string | null;
  topFeatures?: string[];
  morphology?: Record<string, number> | null;
  counterfactualText?: string | null;
  clinicalInsightText?: string | null;
}

const featureLabelMap: Record<string, string> = {
  nc_ratio: "N:C ratio",
  nc_ratio_log1p: "N:C ratio",
  nucleus_area: "Nucleus area",
  mean_r: "Cytoplasmic red intensity",
  mean_g: "Cytoplasmic green intensity",
  mean_b: "Cytoplasmic blue intensity",
  cytoplasm_area: "Cytoplasm area",
  staining_intensity: "Staining intensity",
  granularity: "Granularity",
  roundness: "Roundness",
  perimeter: "Perimeter",
  circularity: "Circularity",
  texture_smoothness: "Texture smoothness",
  "NC ratio": "N:C ratio",
  "Mean R intensity": "Cytoplasmic red intensity",
  "Mean G intensity": "Cytoplasmic green intensity",
  "Mean B intensity": "Cytoplasmic blue intensity",
  "Nucleus area": "Nucleus area",
  "Cell circularity": "Circularity",
  "Cytoplasm area": "Cytoplasm area",
  "Texture smoothness": "Texture smoothness",
};

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function prominenceText(value: number) {
  if (value >= 0.8) {
    return "marked";
  }

  if (value >= 0.6) {
    return "moderate";
  }

  return "mild";
}

export function formatClinicalFeatureLabel(feature: string) {
  return featureLabelMap[feature] ?? titleCase(feature);
}

function describeFeatureList(features: string[]) {
  const labels = features.map((feature) => formatClinicalFeatureLabel(feature).toLowerCase());
  if (!labels.length) {
    return "the dominant morphologic cues in the current image";
  }

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

export function buildMorphologyFindings(input: ClinicalExplainabilityInput) {
  const morphologyEntries = Object.entries(input.morphology ?? {})
    .filter(([, value]) => Number.isFinite(value))
    .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]));

  if (!morphologyEntries.length) {
    return (input.topFeatures ?? []).slice(0, 4).map((feature) => {
      const label = formatClinicalFeatureLabel(feature);
      return `${label} contributed materially to the current interpretation.`;
    });
  }

  return morphologyEntries.slice(0, 4).map(([feature, value]) => {
    const label = formatClinicalFeatureLabel(feature);
    const emphasis = prominenceText(Math.abs(value));

    switch (feature) {
      case "nc_ratio":
      case "nc_ratio_log1p":
        return `${emphasis} elevation of the ${label} supports atypical plasma-cell morphology.`;
      case "nucleus_area":
        return `${emphasis} increase in ${label.toLowerCase()} suggests nuclear prominence.`;
      case "cytoplasm_area":
        return `${emphasis} change in ${label.toLowerCase()} contributes to the overall cell profile.`;
      case "mean_r":
      case "mean_g":
      case "mean_b":
        return `${emphasis} shift in ${label.toLowerCase()} adds stain-based support to the interpretation.`;
      case "granularity":
        return `${emphasis} ${label.toLowerCase()} suggests internal textural irregularity.`;
      case "roundness":
      case "circularity":
        return `${emphasis} change in ${label.toLowerCase()} affects the visual regularity of the cell contour.`;
      default:
        return `${emphasis} prominence of ${label.toLowerCase()} influenced the current review outcome.`;
    }
  });
}

export function buildClinicalChecklist(input: ClinicalExplainabilityInput) {
  const risk = (input.riskLevel ?? "").toLowerCase();
  const confidence = input.confidence ?? 0;
  const checklist: string[] = [];

  if (risk === "high" || confidence >= 0.9) {
    checklist.push("Review the smear image alongside marrow findings before final sign-out.");
    checklist.push("Correlate with plasma-cell burden and any available immunophenotypic studies.");
  } else if (risk === "moderate" || confidence >= 0.75) {
    checklist.push("Compare this image with prior patient samples if available.");
    checklist.push("Consider second-reader review if morphology and clinical context do not align.");
  } else {
    checklist.push("Use this result as supportive evidence during routine microscopy review.");
    checklist.push("Keep the case in the patient timeline for future interval comparison.");
  }

  checklist.push("Do not use the AI result in isolation; correlate with morphology and laboratory context.");
  return checklist;
}

export function buildDoctorFacingCounterfactual(input: ClinicalExplainabilityInput) {
  const features = (input.topFeatures ?? []).slice(0, 3).map((feature) => formatClinicalFeatureLabel(feature));
  const featureText = describeFeatureList(features);
  const confidence = input.confidence ?? 0;
  const risk = (input.riskLevel ?? "").toLowerCase();

  if (!features.length) {
    return "A lower-suspicion interpretation would be supported by less prominent abnormal morphology and a closer visual match to benign reference cells.";
  }

  if (risk === "high" || confidence >= 0.9) {
    return `A lower-suspicion interpretation would require a visibly reduced emphasis in ${featureText}. In review terms, the cell would need to show less nuclear dominance, less abnormal stain behavior, and a morphology pattern closer to a benign or treatment-responsive plasma-cell appearance.`;
  }

  if (risk === "moderate" || confidence >= 0.75) {
    return `This case would move toward a lower-suspicion reading if ${featureText} became less pronounced. At present, these cues remain strong enough that the cell still sits near the suspicious range and merits clinical correlation or second-reader review.`;
  }

  return `The image already sits in a lower-suspicion range, but even less prominence in ${featureText} would further strengthen a benign-leaning interpretation and support routine follow-up rather than escalation.`;
}

export function buildDoctorFacingInsight(input: ClinicalExplainabilityInput) {
  const features = (input.topFeatures ?? []).slice(0, 3);
  const featureText = describeFeatureList(features);
  const risk = (input.riskLevel ?? "").toLowerCase();
  const confidence = input.confidence ?? 0;

  if (risk === "high") {
    return `PlasmaXAI identifies a high-suspicion plasma-cell morphology profile. The strongest support comes from ${featureText}, and the combined image-plus-morphology pattern remains clearly separated from the lower-suspicion range. This should be correlated with the smear field, plasma-cell burden, marrow context, and any ancillary studies before final sign-out.`;
  }

  if (risk === "moderate") {
    return `PlasmaXAI places this image in an intermediate review zone. The strongest support comes from ${featureText}, but the case remains closer to the decision boundary than clearly high-suspicion examples. It is best interpreted alongside prior morphology, the current focus map, and the broader clinical picture.`;
  }

  if (confidence >= 0.8) {
    return `PlasmaXAI supports a lower-suspicion morphology profile for this image. The observed pattern is less consistent with malignant plasma-cell references, although ${featureText} still remain part of the interpretive context. Routine morphologic correlation remains appropriate before closing the case.`;
  }

  return `PlasmaXAI currently favors a lower-suspicion interpretation, but the signal is not intended to replace microscopy review. The image should still be correlated with the morphologic impression, prior cases, laboratory context, and any relevant treatment interval.`;
}
