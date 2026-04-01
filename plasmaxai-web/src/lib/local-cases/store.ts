import { randomUUID } from "crypto";
import { access, copyFile, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { buildCaseReportPdf } from "@/lib/reports/pdf-report";
import type { InferenceResult } from "@/lib/inference/service";
import { demoCases, type DemoCaseRecord } from "@/lib/demo/mock-data";

const LOCAL_DATA_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), ".local-data");
const LOCAL_CASES_FILE = path.join(LOCAL_DATA_DIR, "cases.json");
const LOCAL_UPLOADS_DIR = path.join(LOCAL_DATA_DIR, "uploads");
const LOCAL_REPORTS_DIR = path.join(LOCAL_DATA_DIR, "reports");

function normalizeCaseList(cases: DemoCaseRecord[]) {
  return [...cases].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

function patientIdFromCode(patientCode: string) {
  return `patient-${patientCode.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function sanitizeFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function ensureStore() {
  await mkdir(LOCAL_UPLOADS_DIR, { recursive: true });
  await mkdir(LOCAL_REPORTS_DIR, { recursive: true });

  try {
    await access(LOCAL_CASES_FILE);
  } catch {
    await writeFile(
      LOCAL_CASES_FILE,
      JSON.stringify(normalizeCaseList(demoCases), null, 2),
      "utf-8",
    );
  }
}

async function readLocalCases() {
  await ensureStore();
  const raw = await readFile(LOCAL_CASES_FILE, "utf-8");
  return normalizeCaseList(JSON.parse(raw) as DemoCaseRecord[]);
}

async function writeLocalCases(cases: DemoCaseRecord[]) {
  await ensureStore();
  await writeFile(
    LOCAL_CASES_FILE,
    JSON.stringify(normalizeCaseList(cases), null, 2),
    "utf-8",
  );
}

export async function listLocalCases() {
  return readLocalCases();
}

export async function getLocalCase(caseId: string) {
  const cases = await readLocalCases();
  return cases.find((item) => item.id === caseId) ?? null;
}

export async function createLocalCase(options: {
  patientCode: string;
  patientName: string | null;
  caseTitle: string;
  clinicalNote: string | null;
  imageFile?: File | null;
  imageReference?: string | null;
}) {
  const cases = await readLocalCases();
  const now = new Date().toISOString();
  const caseId = `case-${randomUUID().slice(0, 8)}`;
  const caseCode = `PX-LOCAL-${Date.now().toString().slice(-6)}`;

  let imageRecord: DemoCaseRecord["images"][number] | null = null;

  if (options.imageFile && options.imageFile.size > 0) {
    const safeName = sanitizeFileName(options.imageFile.name || `${caseId}.png`);
    const diskPath = path.join(LOCAL_UPLOADS_DIR, `${caseId}-${safeName}`);
    const bytes = Buffer.from(await options.imageFile.arrayBuffer());
    await writeFile(diskPath, bytes);

    imageRecord = {
      id: `image-${caseId}`,
      fileName: safeName,
      storagePath: diskPath,
      mimeType: options.imageFile.type || null,
      signedUrl: `/api/local-case-file/${caseId}`,
    };
  } else if (options.imageReference) {
    const reference = options.imageReference.trim();
    const parsedName = sanitizeFileName(
      path.basename(reference) || `${caseId}.png`,
    );
    const diskPath = path.join(LOCAL_UPLOADS_DIR, `${caseId}-${parsedName}`);
    await copyFile(reference, diskPath);

    imageRecord = {
      id: `image-${caseId}`,
      fileName: parsedName,
      storagePath: diskPath,
      mimeType: null,
      signedUrl: `/api/local-case-file/${caseId}`,
    };
  }

  const nextCase: DemoCaseRecord = {
    id: caseId,
    caseCode,
    title: options.caseTitle,
    status: "new",
    notes: options.clinicalNote,
    createdAt: now,
    reviewedAt: null,
    patient: {
      id: patientIdFromCode(options.patientCode),
      code: options.patientCode,
      name: options.patientName,
    },
    prediction: null,
    reports: [],
    images: imageRecord ? [imageRecord] : [],
    explanation: imageRecord
      ? {
          counterfactualText:
            "AI review is being prepared for this case. The image viewer is already available for immediate slide inspection.",
          clinicalInsightText:
            "The uploaded smear image is ready for review. PlasmaXAI analysis will add case-specific interpretive commentary and branch-level evidence after inference completes.",
          topFeatures: [],
          heatmapPath: null,
        }
      : null,
    analysis: null,
  };

  await writeLocalCases([nextCase, ...cases]);
  return nextCase;
}

export async function updateLocalCaseReview(options: {
  caseId: string;
  status: string;
  notes: string | null;
}) {
  const cases = await readLocalCases();
  const updated = cases.map((item) =>
    item.id === options.caseId
      ? {
          ...item,
          status: options.status,
          notes: options.notes,
          reviewedAt:
            options.status === "reviewed" || options.status === "report_ready"
              ? new Date().toISOString()
              : null,
        }
      : item,
  );
  await writeLocalCases(updated);
}

export async function updateLocalCaseInference(
  caseId: string,
  payload: {
    predictedClass: string;
    confidence: number;
    riskLevel: string;
    modelVersion: string;
    counterfactualText: string;
    clinicalInsightText: string;
    topFeatures: string[];
    analysis?: DemoCaseRecord["analysis"];
  },
) {
  const cases = await readLocalCases();
  const updated = cases.map((item) =>
    item.id === caseId
      ? {
          ...item,
          status: "report_ready",
          prediction: {
            predictedClass: payload.predictedClass,
            confidence: payload.confidence,
            riskLevel: payload.riskLevel,
            modelVersion: payload.modelVersion,
          },
          explanation: {
            counterfactualText: payload.counterfactualText,
            clinicalInsightText: payload.clinicalInsightText,
            topFeatures: payload.topFeatures,
            heatmapPath: null,
          },
          analysis: payload.analysis ?? null,
        }
      : item,
  );
  await writeLocalCases(updated);
}

function buildFallbackInferenceResult(caseItem: DemoCaseRecord): InferenceResult | null {
  if (!caseItem.prediction) {
    return null;
  }

  const malignantProbability =
    caseItem.prediction.predictedClass.toLowerCase().includes("benign")
      ? 1 - caseItem.prediction.confidence
      : caseItem.prediction.confidence;

  const probabilities = caseItem.analysis?.probabilities ?? {
    plasmaxai: malignantProbability,
    resnet50: Math.max(malignantProbability - 0.05, 0.01),
    densenet121: Math.max(malignantProbability - 0.08, 0.01),
    counterfactual: Math.min(malignantProbability + 0.03, 0.99),
  };

  const modalityGates = caseItem.analysis?.modalityGates ?? {
    resnet50: 0.32,
    densenet121: 0.22,
    morphology: 0.24,
    counterfactual: 0.22,
  };

  const morphology = caseItem.analysis?.morphology ?? {
    nc_ratio: 0.45,
    nucleus_area: 0.41,
    cytoplasm_area: 0.39,
    staining_intensity: 0.52,
    granularity: 0.36,
    roundness: 0.49,
    mean_r: 0.57,
    mean_g: 0.51,
    mean_b: 0.48,
  };

  return {
    caseId: caseItem.id,
    caseCode: caseItem.caseCode,
    patientCode: caseItem.patient?.code ?? "PT-LOCAL",
    title: caseItem.title,
    status: "completed",
    framework: "PlasmaXAI",
    modelVersion: caseItem.prediction.modelVersion,
    threshold: 0.72,
    prediction: {
      label: caseItem.prediction.predictedClass,
      confidence: caseItem.prediction.confidence,
      plasmaProbability: probabilities.plasmaxai,
      riskLevel: caseItem.prediction.riskLevel,
      predictedClassText: caseItem.prediction.predictedClass,
    },
    explanation: {
      counterfactualText:
        caseItem.explanation?.counterfactualText ??
        "Case-specific counterfactual interpretation was not available in the stored record.",
      clinicalInsightText:
        caseItem.explanation?.clinicalInsightText ??
        "Case-specific clinical insight was not available in the stored record.",
      topFeatures: caseItem.explanation?.topFeatures ?? [],
    },
    probabilities,
    modalityGates,
    morphology,
  };
}

export async function ensureLocalCaseReport(caseId: string) {
  const cases = await readLocalCases();
  const caseItem = cases.find((item) => item.id === caseId) ?? null;

  if (!caseItem) {
    return null;
  }

  const result = buildFallbackInferenceResult(caseItem);
  if (!result) {
    return null;
  }

  const pdfBytes = await buildCaseReportPdf({
    caseCode: caseItem.caseCode,
    caseTitle: caseItem.title,
    patientCode: caseItem.patient?.code ?? "PT-LOCAL",
    patientName: caseItem.patient?.name ?? null,
    doctorName: "Dr. Ayesha Rahman",
    specialization: "Hematopathology",
    clinicalNote: caseItem.notes,
    imagePath: caseItem.images[0]?.storagePath ?? null,
    result,
  });

  const fileName = `${caseItem.caseCode.toLowerCase()}-report.pdf`;
  const diskPath = path.join(LOCAL_REPORTS_DIR, `${caseItem.id}-${fileName}`);
  await writeFile(diskPath, pdfBytes);

  const reportRecord = {
    id: `report-${caseItem.id}`,
    storagePath: diskPath,
    reportType: "pdf",
    generatedAt: new Date().toISOString(),
    signedUrl: `/api/local-report-file/${caseItem.id}`,
  };

  const updatedCases = cases.map((item) =>
    item.id === caseId
      ? {
          ...item,
          reports: [reportRecord],
        }
      : item,
  );

  await writeLocalCases(updatedCases);
  return reportRecord;
}
