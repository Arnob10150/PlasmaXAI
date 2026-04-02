import { randomUUID } from "crypto";
import { access, copyFile, mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { buildCaseReportPdf } from "@/lib/reports/pdf-report";
import type { InferenceResult } from "@/lib/inference/service";
import { demoCases, type DemoCaseRecord } from "@/lib/demo/mock-data";

export interface LocalPatientRecord {
  id: string;
  code: string;
  name: string | null;
  sex: string | null;
  dateOfBirth: string | null;
  createdAt: string;
  updatedAt: string;
}

const LOCAL_DATA_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), ".local-data");
const LOCAL_CASES_FILE = path.join(LOCAL_DATA_DIR, "cases.json");
const LOCAL_PATIENTS_FILE = path.join(LOCAL_DATA_DIR, "patients.json");
const LOCAL_UPLOADS_DIR = path.join(LOCAL_DATA_DIR, "uploads");
const LOCAL_REPORTS_DIR = path.join(LOCAL_DATA_DIR, "reports");

function normalizeCaseList(cases: DemoCaseRecord[]) {
  return [...cases].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

function normalizePatientList(patients: LocalPatientRecord[]) {
  return [...patients].sort((left, right) => left.code.localeCompare(right.code));
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

function seedPatientsFromCases() {
  const now = new Date().toISOString();
  const unique = new Map<string, LocalPatientRecord>();

  for (const item of demoCases) {
    if (!item.patient) {
      continue;
    }

    if (!unique.has(item.patient.id)) {
      unique.set(item.patient.id, {
        id: item.patient.id,
        code: item.patient.code,
        name: item.patient.name ?? null,
        sex: null,
        dateOfBirth: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return normalizePatientList(Array.from(unique.values()));
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

  try {
    await access(LOCAL_PATIENTS_FILE);
  } catch {
    await writeFile(
      LOCAL_PATIENTS_FILE,
      JSON.stringify(seedPatientsFromCases(), null, 2),
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

async function readLocalPatients() {
  await ensureStore();
  const raw = await readFile(LOCAL_PATIENTS_FILE, "utf-8");
  return normalizePatientList(JSON.parse(raw) as LocalPatientRecord[]);
}

async function writeLocalPatients(patients: LocalPatientRecord[]) {
  await ensureStore();
  await writeFile(
    LOCAL_PATIENTS_FILE,
    JSON.stringify(normalizePatientList(patients), null, 2),
    "utf-8",
  );
}

async function upsertLocalPatient(options: {
  patientCode: string;
  patientName: string | null;
  sex?: string | null;
  dateOfBirth?: string | null;
}) {
  const patients = await readLocalPatients();
  const now = new Date().toISOString();
  const normalizedCode = options.patientCode.trim();
  const existing = patients.find((item) => item.code.toLowerCase() === normalizedCode.toLowerCase());

  if (existing) {
    const updatedPatient: LocalPatientRecord = {
      ...existing,
      name: options.patientName ?? existing.name ?? null,
      sex: options.sex ?? existing.sex ?? null,
      dateOfBirth: options.dateOfBirth ?? existing.dateOfBirth ?? null,
      updatedAt: now,
    };

    await writeLocalPatients(
      patients.map((item) => (item.id === existing.id ? updatedPatient : item)),
    );
    return updatedPatient;
  }

  const nextPatient: LocalPatientRecord = {
    id: patientIdFromCode(normalizedCode),
    code: normalizedCode,
    name: options.patientName ?? null,
    sex: options.sex ?? null,
    dateOfBirth: options.dateOfBirth ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await writeLocalPatients([...patients, nextPatient]);
  return nextPatient;
}

export async function listLocalCases() {
  return readLocalCases();
}

export async function getLocalCase(caseId: string) {
  const cases = await readLocalCases();
  return cases.find((item) => item.id === caseId) ?? null;
}

export async function listLocalPatients() {
  return readLocalPatients();
}

export async function getLocalPatient(patientId: string) {
  const patients = await readLocalPatients();
  return patients.find((item) => item.id === patientId) ?? null;
}

export async function createLocalPatient(options: {
  patientCode: string;
  patientName: string | null;
  sex?: string | null;
  dateOfBirth?: string | null;
}) {
  const patientCode = options.patientCode.trim();
  if (!patientCode) {
    throw new Error("Patient code is required.");
  }

  const patients = await readLocalPatients();
  const existing = patients.find((item) => item.code.toLowerCase() === patientCode.toLowerCase());
  if (existing) {
    throw new Error("A patient with this code already exists.");
  }

  return upsertLocalPatient(options);
}

export async function updateLocalPatient(
  patientId: string,
  updates: {
    patientCode: string;
    patientName: string | null;
    sex?: string | null;
    dateOfBirth?: string | null;
  },
) {
  const patients = await readLocalPatients();
  const cases = await readLocalCases();
  const current = patients.find((item) => item.id === patientId);

  if (!current) {
    throw new Error("Patient record was not found.");
  }

  const normalizedCode = updates.patientCode.trim();
  if (!normalizedCode) {
    throw new Error("Patient code is required.");
  }

  const duplicate = patients.find(
    (item) => item.id !== patientId && item.code.toLowerCase() === normalizedCode.toLowerCase(),
  );
  if (duplicate) {
    throw new Error("Another patient already uses this code.");
  }

  const updatedPatient: LocalPatientRecord = {
    ...current,
    code: normalizedCode,
    name: updates.patientName ?? null,
    sex: updates.sex ?? null,
    dateOfBirth: updates.dateOfBirth ?? null,
    updatedAt: new Date().toISOString(),
  };

  const updatedCases = cases.map((item) =>
    item.patient?.id === patientId
      ? {
          ...item,
          patient: {
            id: patientId,
            code: updatedPatient.code,
            name: updatedPatient.name,
          },
        }
      : item,
  );

  await writeLocalPatients(
    patients.map((item) => (item.id === patientId ? updatedPatient : item)),
  );
  await writeLocalCases(updatedCases);

  return updatedPatient;
}

export async function deleteLocalPatient(patientId: string) {
  const patients = await readLocalPatients();
  const cases = await readLocalCases();
  const existing = patients.find((item) => item.id === patientId);

  if (!existing) {
    throw new Error("Patient record was not found.");
  }

  const linkedCases = cases.filter((item) => item.patient?.id === patientId);
  if (linkedCases.length) {
    throw new Error("This patient still has linked cases. Remove or reassign those cases before deleting the patient profile.");
  }

  await writeLocalPatients(patients.filter((item) => item.id !== patientId));
}

export async function createLocalCase(options: {
  patientCode: string;
  patientName: string | null;
  sex?: string | null;
  dateOfBirth?: string | null;
  caseTitle: string;
  clinicalNote: string | null;
  imageFile?: File | null;
  imageReference?: string | null;
}) {
  const cases = await readLocalCases();
  const now = new Date().toISOString();
  const caseId = `case-${randomUUID().slice(0, 8)}`;
  const caseCode = `PX-LOCAL-${Date.now().toString().slice(-6)}`;
  const patient = await upsertLocalPatient({
    patientCode: options.patientCode,
    patientName: options.patientName,
    sex: options.sex ?? null,
    dateOfBirth: options.dateOfBirth ?? null,
  });

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
      id: patient.id,
      code: patient.code,
      name: patient.name,
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
  title?: string | null;
  status: string;
  notes: string | null;
}) {
  const cases = await readLocalCases();
  const updated = cases.map((item) =>
    item.id === options.caseId
      ? {
          ...item,
          title: options.title?.trim() ? options.title.trim() : item.title,
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

export async function deleteLocalCase(caseId: string) {
  const cases = await readLocalCases();
  const current = cases.find((item) => item.id === caseId);

  if (!current) {
    throw new Error("Case record was not found.");
  }

  const cleanupPaths = [
    current.images[0]?.storagePath ?? null,
    current.reports[0]?.storagePath ?? null,
  ].filter((value): value is string => Boolean(value) && /^[a-zA-Z]:\\/.test(value!));

  for (const filePath of cleanupPaths) {
    try {
      await unlink(filePath);
    } catch {
      // Keep deletion resilient even if the file has already been removed.
    }
  }

  await writeLocalCases(cases.filter((item) => item.id !== caseId));
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

export async function ensureLocalCaseReport(
  caseId: string,
  doctor?: {
    doctorName?: string | null;
    specialization?: string | null;
  },
) {
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
    doctorName: doctor?.doctorName?.trim() || "Clinical reviewer",
    specialization: doctor?.specialization?.trim() || "Hematopathology",
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
