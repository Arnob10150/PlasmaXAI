import { cookies } from "next/headers";
import {
  demoCases,
  demoDoctors,
  type DemoCaseRecord,
  type DemoDoctor,
} from "@/lib/demo/mock-data";
import type { InferenceResult } from "@/lib/inference/service";
import {
  buildDefaultReportDraft,
  buildDefaultReviewChecklist,
  normalizeReportDraft,
  normalizeReviewChecklist,
  type ReportDraft,
  type ReviewChecklistItem,
} from "@/lib/review-workspace";
import { decodeCookiePayload, encodeCookiePayload } from "@/lib/demo/cookie-codec";

const CASES_COOKIE = "plasmaxai-demo-cases";
const DOCTORS_COOKIE = "plasmaxai-demo-doctors";
const PATIENTS_COOKIE = "plasmaxai-demo-patients";
const CASE_WORKBENCH_COOKIE_PREFIX = "plasmaxai-demo-workbench-";
const COOKIE_CHUNK_SIZE = 3000;

function cookieOptions() {
  return {
    httpOnly: false,
    sameSite: "lax" as const,
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}

function seedDoctors() {
  return demoDoctors.map((doctor) => ({
    ...doctor,
    organizationName: "PlasmaXAI Clinical Lab",
  }));
}

function seedPatients() {
  const unique = new Map<
    string,
    {
      id: string;
      code: string;
      name: string | null;
      sex: string | null;
      dateOfBirth: string | null;
      createdAt: string;
      updatedAt: string;
    }
  >();

  for (const item of demoCases) {
    if (!item.patient) {
      continue;
    }

    const now = item.createdAt;
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

  return [...unique.values()].sort((left, right) => left.code.localeCompare(right.code));
}

function normalizeCases(items: DemoCaseRecord[]) {
  return [...items].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

function buildCaseWorkspaceDefaults(caseItem: Pick<
  DemoCaseRecord,
  "prediction" | "explanation" | "reviewChecklist" | "reportDraft"
>) {
  return {
    reviewChecklist: normalizeReviewChecklist(
      caseItem.reviewChecklist,
      caseItem.explanation?.topFeatures ?? [],
    ),
    reportDraft: normalizeReportDraft(
      caseItem.reportDraft,
      buildDefaultReportDraft({
        predictedClass: caseItem.prediction?.predictedClass ?? null,
        confidence: caseItem.prediction?.confidence ?? null,
        topFeatures: caseItem.explanation?.topFeatures ?? [],
        doctorInsight: caseItem.explanation?.clinicalInsightText ?? null,
        recommendedAction: null,
      }),
    ),
  };
}

function getCaseWorkbenchCookieName(caseId: string) {
  return `${CASE_WORKBENCH_COOKIE_PREFIX}${caseId}`;
}

function getChunkCookieName(baseName: string, index: number) {
  return `${baseName}.${index}`;
}

function getChunkCookieNames(baseName: string, value: string) {
  const chunks: string[] = [];
  for (let offset = 0; offset < value.length; offset += COOKIE_CHUNK_SIZE) {
    chunks.push(value.slice(offset, offset + COOKIE_CHUNK_SIZE));
  }

  return chunks.map((chunk, index) => ({
    name: chunks.length === 1 ? baseName : getChunkCookieName(baseName, index),
    value: chunk,
  }));
}

function parseChunkCookieIndex(baseName: string, cookieName: string) {
  if (!cookieName.startsWith(`${baseName}.`)) {
    return null;
  }

  const suffix = cookieName.slice(baseName.length + 1);
  return /^\d+$/.test(suffix) ? Number(suffix) : null;
}

async function clearCookieEntry(baseName: string) {
  const cookieStore = await cookies();
  const existing = cookieStore
    .getAll()
    .filter(
      (cookie) => cookie.name === baseName || parseChunkCookieIndex(baseName, cookie.name) !== null,
    );

  for (const cookie of existing) {
    cookieStore.delete(cookie.name);
  }
}

async function readChunkedCookie(baseName: string) {
  const cookieStore = await cookies();
  const single = cookieStore.get(baseName)?.value;
  if (single) {
    return single;
  }

  const chunks = cookieStore
    .getAll()
    .map((cookie) => ({
      index: parseChunkCookieIndex(baseName, cookie.name),
      value: cookie.value,
    }))
    .filter((cookie): cookie is { index: number; value: string } => cookie.index !== null)
    .sort((left, right) => left.index - right.index);

  if (!chunks.length) {
    return null;
  }

  return chunks.map((chunk) => chunk.value).join("");
}

async function writeChunkedCookie(baseName: string, value: string) {
  const cookieStore = await cookies();
  await clearCookieEntry(baseName);

  for (const chunk of getChunkCookieNames(baseName, value)) {
    cookieStore.set(chunk.name, chunk.value, cookieOptions());
  }
}

function stripCaseWorkbench(caseItem: DemoCaseRecord): DemoCaseRecord {
  return {
    ...caseItem,
    reviewChecklist: undefined,
    reportDraft: undefined,
  };
}

async function getHostedWorkbenchMap() {
  const cookieStore = await cookies();
  const entryNames = new Set(
    cookieStore
      .getAll()
      .filter((cookie) => cookie.name.startsWith(CASE_WORKBENCH_COOKIE_PREFIX))
      .map((cookie) => {
        const suffix = cookie.name.slice(CASE_WORKBENCH_COOKIE_PREFIX.length);
        const dotIndex = suffix.lastIndexOf(".");
        const chunkSuffix = dotIndex >= 0 ? suffix.slice(dotIndex + 1) : "";

        if (dotIndex >= 0 && /^\d+$/.test(chunkSuffix)) {
          return `${CASE_WORKBENCH_COOKIE_PREFIX}${suffix.slice(0, dotIndex)}`;
        }

        return cookie.name;
      }),
  );

  const workbenchByCaseId = new Map<
    string,
    {
      reviewChecklist: ReviewChecklistItem[];
      reportDraft: ReportDraft;
    }
  >();

  for (const entryName of entryNames) {
    const caseId = entryName.slice(CASE_WORKBENCH_COOKIE_PREFIX.length);
    if (!caseId) {
      continue;
    }

    const parsed = decodeCookiePayload<{
      reviewChecklist?: ReviewChecklistItem[];
      reportDraft?: ReportDraft;
    }>(await readChunkedCookie(entryName));

    if (!parsed) {
      continue;
    }

    try {
      workbenchByCaseId.set(caseId, {
        reviewChecklist: normalizeReviewChecklist(parsed.reviewChecklist, []),
        reportDraft: normalizeReportDraft(
          parsed.reportDraft,
          buildDefaultReportDraft({
            predictedClass: null,
            confidence: null,
            topFeatures: [],
            doctorInsight: null,
            recommendedAction: null,
          }),
        ),
      });
    } catch {
      continue;
    }
  }

  return workbenchByCaseId;
}

async function setHostedCaseWorkbench(
  caseId: string,
  payload: {
    reviewChecklist: ReviewChecklistItem[];
    reportDraft: ReportDraft;
  },
) {
  await writeChunkedCookie(
    getCaseWorkbenchCookieName(caseId),
    encodeCookiePayload({
      reviewChecklist: payload.reviewChecklist,
      reportDraft: payload.reportDraft,
    }),
  );
}

async function deleteHostedCaseWorkbench(caseId: string) {
  await clearCookieEntry(getCaseWorkbenchCookieName(caseId));
}

export async function getHostedDemoCases() {
  const raw = await readChunkedCookie(CASES_COOKIE);
  const workbenchByCaseId = await getHostedWorkbenchMap();

  const enrichCases = (items: DemoCaseRecord[]) =>
    normalizeCases(items).map((item) => {
      const defaults = buildCaseWorkspaceDefaults(item);
      const storedWorkbench = workbenchByCaseId.get(item.id);
      return {
        ...item,
        reviewChecklist: storedWorkbench?.reviewChecklist ?? defaults.reviewChecklist,
        reportDraft: storedWorkbench?.reportDraft ?? defaults.reportDraft,
      };
    });

  if (!raw) {
    return enrichCases(demoCases);
  }

  const parsed = decodeCookiePayload<DemoCaseRecord[]>(raw);
  if (!parsed) {
    return enrichCases(demoCases);
  }

  return enrichCases(parsed);
}

export async function setHostedDemoCases(cases: DemoCaseRecord[]) {
  await writeChunkedCookie(
    CASES_COOKIE,
    encodeCookiePayload(normalizeCases(cases).map(stripCaseWorkbench)),
  );
}

export async function getHostedDemoDoctors() {
  const raw = await readChunkedCookie(DOCTORS_COOKIE);

  if (!raw) {
    return seedDoctors();
  }

  const parsed = decodeCookiePayload<Array<DemoDoctor & { organizationName: string }>>(raw);
  if (!parsed) {
    return seedDoctors();
  }

  return parsed;
}

export async function getHostedDemoPatients() {
  const raw = await readChunkedCookie(PATIENTS_COOKIE);

  if (!raw) {
    return seedPatients();
  }

  const parsed = decodeCookiePayload<ReturnType<typeof seedPatients>>(raw);
  if (!parsed) {
    return seedPatients();
  }

  return parsed;
}

async function setHostedDemoPatients(
  patients: Awaited<ReturnType<typeof getHostedDemoPatients>>,
) {
  await writeChunkedCookie(
    PATIENTS_COOKIE,
    encodeCookiePayload(
      [...patients].sort((left, right) => left.code.localeCompare(right.code)),
    ),
  );
}

export async function getHostedDemoDoctorByEmail(email: string | null | undefined) {
  const doctors = await getHostedDemoDoctors();
  if (!email) {
    return doctors[0];
  }

  return doctors.find((doctor) => doctor.email.toLowerCase() === email.toLowerCase()) ?? doctors[0];
}

export async function updateHostedDemoDoctorProfile(
  email: string,
  updates: {
    fullName: string;
    specialization: string;
    organizationName: string;
  },
) {
  const doctors = await getHostedDemoDoctors();
  const next = doctors.map((doctor) =>
    doctor.email.toLowerCase() === email.toLowerCase()
      ? {
          ...doctor,
          fullName: updates.fullName.trim() || doctor.fullName,
          specialization: updates.specialization.trim() || doctor.specialization,
          organizationName: updates.organizationName.trim() || doctor.organizationName,
        }
      : doctor,
  );

  await writeChunkedCookie(DOCTORS_COOKIE, encodeCookiePayload(next));
  return next.find((doctor) => doctor.email.toLowerCase() === email.toLowerCase()) ?? next[0];
}

export async function createHostedDemoCase(options: {
  caseId?: string | null;
  patientCode: string;
  patientName: string | null;
  caseTitle: string;
  clinicalNote: string | null;
  initialStatus?: string | null;
  imageDataUrl?: string | null;
  imageReference?: string | null;
  imageFileName?: string | null;
  imageMimeType?: string | null;
  inferenceResult?: InferenceResult | null;
}) {
  const cases = await getHostedDemoCases();
  const patients = await getHostedDemoPatients();
  const seed = demoCases[cases.length % demoCases.length] ?? demoCases[0];
  const now = new Date().toISOString();
  const suffix = (options.caseId?.replace(/^case-/, "") || Date.now().toString().slice(-6)).slice(-8);
  const normalizedImageSource = options.imageDataUrl?.trim() || options.imageReference?.trim() || null;
  const normalizedFileName =
    options.imageFileName?.trim() ||
    normalizedImageSource?.split(/[\\/]/).pop() ||
    `case-image-${suffix}.png`;
  const patientId = `patient-${options.patientCode.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const existingPatient = patients.find((patient) => patient.id === patientId);
  const nextPatient = existingPatient
    ? {
        ...existingPatient,
        code: options.patientCode,
        name: options.patientName ?? existingPatient.name,
        updatedAt: now,
      }
    : {
        id: patientId,
        code: options.patientCode,
        name: options.patientName,
        sex: null,
        dateOfBirth: null,
        createdAt: now,
        updatedAt: now,
      };
  const result = options.inferenceResult ?? null;
  const nextCase: DemoCaseRecord = {
    ...seed,
    id: options.caseId?.trim() || `case-${suffix}`,
    caseCode: `PX-${suffix}`,
    title: options.caseTitle,
    notes: options.clinicalNote,
    status: options.initialStatus?.trim() || (result ? "report_ready" : "new"),
    createdAt: now,
    reviewedAt: result ? now : null,
    patient: {
      id: patientId,
      code: options.patientCode,
      name: options.patientName,
    },
    images: normalizedImageSource
      ? [
          {
            id: `image-${suffix}`,
            fileName: normalizedFileName,
            storagePath: normalizedImageSource,
            mimeType: options.imageMimeType?.trim() || null,
            signedUrl: normalizedImageSource,
          },
        ]
      : [],
    reports: [],
    prediction: result
      ? {
          predictedClass: result.prediction.predictedClassText,
          confidence: result.prediction.confidence,
          riskLevel: result.prediction.riskLevel,
          modelVersion: result.modelVersion,
        }
      : null,
    explanation: result
      ? {
          counterfactualText: result.explanation.counterfactualText,
          clinicalInsightText: result.explanation.clinicalInsightText,
          topFeatures: result.explanation.topFeatures,
          heatmapPath: null,
        }
      : null,
    analysis: result
      ? {
          probabilities: result.probabilities,
          modalityGates: result.modalityGates,
          morphology: result.morphology,
        }
      : null,
    reviewChecklist: buildDefaultReviewChecklist(result?.explanation.topFeatures ?? []),
    reportDraft: buildDefaultReportDraft({
      predictedClass: result?.prediction.predictedClassText ?? null,
      confidence: result?.prediction.confidence ?? null,
      topFeatures: result?.explanation.topFeatures ?? [],
      doctorInsight: result?.explanation.clinicalInsightText ?? null,
      recommendedAction: null,
    }),
  };

  await setHostedDemoPatients(
    existingPatient
      ? patients.map((patient) => (patient.id === patientId ? nextPatient : patient))
      : [...patients, nextPatient],
  );
  await setHostedDemoCases([nextCase, ...cases]);
  return nextCase;
}

export async function createHostedDemoPatient(options: {
  patientCode: string;
  patientName: string | null;
  sex?: string | null;
  dateOfBirth?: string | null;
}) {
  const patients = await getHostedDemoPatients();
  const normalizedCode = options.patientCode.trim();

  if (!normalizedCode) {
    throw new Error("Patient code is required.");
  }

  if (patients.some((patient) => patient.code.toLowerCase() === normalizedCode.toLowerCase())) {
    throw new Error("A patient with this code already exists.");
  }

  const now = new Date().toISOString();
  const nextPatient = {
    id: `patient-${normalizedCode.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    code: normalizedCode,
    name: options.patientName ?? null,
    sex: options.sex ?? null,
    dateOfBirth: options.dateOfBirth ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await setHostedDemoPatients([...patients, nextPatient]);
  return nextPatient;
}

export async function updateHostedDemoPatient(
  patientId: string,
  updates: {
    patientCode: string;
    patientName: string | null;
    sex?: string | null;
    dateOfBirth?: string | null;
  },
) {
  const patients = await getHostedDemoPatients();
  const cases = await getHostedDemoCases();
  const current = patients.find((patient) => patient.id === patientId);

  if (!current) {
    throw new Error("Patient record was not found.");
  }

  const normalizedCode = updates.patientCode.trim();
  if (!normalizedCode) {
    throw new Error("Patient code is required.");
  }

  const duplicate = patients.find(
    (patient) => patient.id !== patientId && patient.code.toLowerCase() === normalizedCode.toLowerCase(),
  );
  if (duplicate) {
    throw new Error("Another patient already uses this code.");
  }

  const nextPatient = {
    ...current,
    code: normalizedCode,
    name: updates.patientName ?? null,
    sex: updates.sex ?? null,
    dateOfBirth: updates.dateOfBirth ?? null,
    updatedAt: new Date().toISOString(),
  };

  const nextCases = cases.map((item) =>
    item.patient?.id === patientId
      ? {
          ...item,
          patient: {
            id: patientId,
            code: nextPatient.code,
            name: nextPatient.name,
          },
        }
      : item,
  );

  await setHostedDemoPatients(
    patients.map((patient) => (patient.id === patientId ? nextPatient : patient)),
  );
  await setHostedDemoCases(nextCases);
  return nextPatient;
}

export async function deleteHostedDemoPatient(patientId: string) {
  const patients = await getHostedDemoPatients();
  const cases = await getHostedDemoCases();
  const current = patients.find((patient) => patient.id === patientId);

  if (!current) {
    throw new Error("Patient record was not found.");
  }

  if (cases.some((item) => item.patient?.id === patientId)) {
    throw new Error(
      "This patient still has linked cases. Remove or reassign those cases before deleting the patient profile.",
    );
  }

  await setHostedDemoPatients(patients.filter((patient) => patient.id !== patientId));
}

export async function updateHostedDemoCaseReview(options: {
  caseId: string;
  title?: string | null;
  status: string;
  notes: string | null;
}) {
  const cases = await getHostedDemoCases();
  const nextCases = cases.map((item) =>
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
  await setHostedDemoCases(nextCases);
}

export async function updateHostedDemoCaseWorkbench(options: {
  caseId: string;
  reviewChecklist: ReviewChecklistItem[];
  reportDraft: ReportDraft;
}) {
  const cases = await getHostedDemoCases();
  const now = new Date().toISOString();
  const normalizedChecklist = normalizeReviewChecklist(options.reviewChecklist, []);
  const normalizedDraft = normalizeReportDraft(
    options.reportDraft,
    buildDefaultReportDraft({
      predictedClass: null,
      confidence: null,
      topFeatures: [],
      doctorInsight: null,
      recommendedAction: null,
    }),
  );
  const nextCases = cases.map((item) => {
    if (item.id !== options.caseId) {
      return item;
    }

    const nextDraft = {
      ...normalizeReportDraft(normalizedDraft, item.reportDraft ?? normalizedDraft),
      updatedAt: now,
      finalizedAt: options.reportDraft.finalized
        ? options.reportDraft.finalizedAt ?? now
        : null,
    };

    return {
      ...item,
      reviewChecklist: normalizedChecklist,
      reportDraft: nextDraft,
      status: nextDraft.finalized ? "report_ready" : item.status,
      reviewedAt: nextDraft.finalized ? now : item.reviewedAt,
    };
  });

  const caseItem = nextCases.find((item) => item.id === options.caseId);
  if (caseItem) {
    await setHostedCaseWorkbench(options.caseId, {
      reviewChecklist: normalizedChecklist,
      reportDraft: caseItem.reportDraft ?? normalizedDraft,
    });
  }
  await setHostedDemoCases(nextCases);
}

export async function deleteHostedDemoCase(caseId: string) {
  const cases = await getHostedDemoCases();
  if (!cases.some((item) => item.id === caseId)) {
    throw new Error("Case record was not found.");
  }

  await deleteHostedCaseWorkbench(caseId);
  await setHostedDemoCases(cases.filter((item) => item.id !== caseId));
}
