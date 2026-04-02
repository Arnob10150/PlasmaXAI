import { NextResponse } from "next/server";
import { getHostedDemoCases } from "@/lib/demo/session-store";
import { buildCaseReportPdf } from "@/lib/reports/pdf-report";
import { getCurrentUser } from "@/lib/supabase/auth";
import { getDisplayCaseTitle, getDisplayPatientCode, getDisplayPatientName } from "@/lib/patient-display";

export const runtime = "nodejs";

function isHostedDeployment() {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
}

async function buildHostedDemoReportResponse(caseId: string, imageDataUrl?: string | null) {
  const user = await getCurrentUser();
  const cases = await getHostedDemoCases();
  const caseItem = cases.find((item) => item.id === caseId) ?? null;

  if (!caseItem || !caseItem.prediction) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const malignantProbability =
    caseItem.prediction.predictedClass.toLowerCase().includes("benign")
      ? 1 - caseItem.prediction.confidence
      : caseItem.prediction.confidence;

  const result = {
    caseId: caseItem.id,
    caseCode: caseItem.caseCode,
    patientCode: caseItem.patient?.code ?? "PX-PAT-001",
    title: caseItem.title,
    status: "completed" as const,
    framework: "PlasmaXAI",
    modelVersion: caseItem.prediction.modelVersion,
    threshold: 0.72,
    prediction: {
      label: caseItem.prediction.predictedClass,
      confidence: caseItem.prediction.confidence,
      plasmaProbability: caseItem.analysis?.probabilities?.plasmaxai ?? malignantProbability,
      riskLevel: caseItem.prediction.riskLevel,
      predictedClassText: caseItem.prediction.predictedClass,
    },
    explanation: {
      counterfactualText:
        caseItem.explanation?.counterfactualText ??
        "Counterfactual interpretation is unavailable for this hosted demo case.",
      clinicalInsightText:
        caseItem.explanation?.clinicalInsightText ??
        "Clinical insight summary is unavailable for this hosted demo case.",
      topFeatures: caseItem.explanation?.topFeatures ?? [],
    },
    probabilities: caseItem.analysis?.probabilities ?? {
      plasmaxai: malignantProbability,
      resnet50: Math.max(malignantProbability - 0.04, 0.01),
      densenet121: Math.max(malignantProbability - 0.07, 0.01),
      counterfactual: Math.max(malignantProbability - 0.03, 0.01),
    },
    modalityGates: caseItem.analysis?.modalityGates ?? {
      resnet50: 0.31,
      densenet121: 0.24,
      morphology: 0.2,
      counterfactual: 0.25,
    },
    morphology: caseItem.analysis?.morphology ?? {},
  };

  const pdfBytes = await buildCaseReportPdf({
    caseCode: caseItem.caseCode,
    caseTitle: getDisplayCaseTitle(caseItem.caseCode, caseItem.title),
    patientCode: getDisplayPatientCode(caseItem.patient?.id ?? null, caseItem.patient?.code ?? null),
    patientName: getDisplayPatientName(caseItem.patient?.id ?? null, caseItem.patient?.code ?? null, caseItem.patient?.name ?? null),
    doctorName:
      user?.user_metadata?.full_name ??
      user?.user_metadata?.name ??
      user?.email?.split("@")[0] ??
      "Clinical reviewer",
    specialization: user?.user_metadata?.specialization ?? "Hematopathology",
    clinicalNote: caseItem.notes,
    imagePath: caseItem.images[0]?.signedUrl ?? caseItem.images[0]?.storagePath ?? null,
    imageDataUrl: imageDataUrl ?? null,
    result,
    reportDraft: caseItem.reportDraft ?? null,
    reviewChecklist: caseItem.reviewChecklist ?? [],
  });

  const fileName = `${caseId}-plasmaxai-report.pdf`;
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"${fileName}\"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await params;

  if (isHostedDeployment()) {
    return buildHostedDemoReportResponse(caseId);
  }

  const user = await getCurrentUser();

  const { ensureLocalCaseReport } = await import("@/lib/local-cases/store");
  const report = await ensureLocalCaseReport(caseId, {
    doctorName:
      user?.user_metadata?.full_name ??
      user?.user_metadata?.name ??
      user?.email?.split("@")[0] ??
      "Clinical reviewer",
    specialization: user?.user_metadata?.specialization ?? "Hematopathology",
  });

  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const { readFile } = await import("fs/promises");
  const file = await readFile(/*turbopackIgnore: true*/ report.storagePath);
  const fileName = `${caseId}-plasmaxai-report.pdf`;

  return new NextResponse(file, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await params;

  if (!isHostedDeployment()) {
    return GET(request, { params: Promise.resolve({ caseId }) });
  }

  let imageDataUrl: string | null = null;
  try {
    const payload = (await request.json()) as { imageDataUrl?: string | null };
    imageDataUrl = payload.imageDataUrl?.trim() ?? null;
  } catch {
    imageDataUrl = null;
  }

  return buildHostedDemoReportResponse(caseId, imageDataUrl);
}
