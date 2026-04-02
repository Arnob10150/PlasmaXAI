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

const CASES_COOKIE = "plasmaxai-demo-cases";
const DOCTORS_COOKIE = "plasmaxai-demo-doctors";
const PATIENTS_COOKIE = "plasmaxai-demo-patients";
const CASE_WORKBENCH_COOKIE_PREFIX = "plasmaxai-demo-workbench-";

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

function stripCaseWorkbench(caseItem: DemoCaseRecord): DemoCaseRecord {
  return {
    ...caseItem,
    reviewChecklist: undefined,
    reportDraft: undefined,
  };
}

async function getHostedWorkbenchMap() {
  const cookieStore = await cookies();
  const entries = cookieStore
    .getAll()
    .filter((cookie) => cookie.name.startsWith(CASE_WORKBENCH_COOKIE_PREFIX));

  const workbenchByCaseId = new Map<
    string,
    {
      reviewChecklist: ReviewChecklistItem[];
      reportDraft: ReportDraft;
    }
  >();

  for (const entry of entries) {
    const caseId = entry.name.slice(CASE_WORKBENCH_COOKIE_PREFIX.length);
    if (!caseId) {
      continue;
    }

    try {
      const parsed = JSON.parse(entry.value) as {
        reviewChecklist?: ReviewChecklistItem[];
        reportDraft?: ReportDraft;
      };

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
  const cookieStore = await cookies();
  cookieStore.set(
    getCaseWorkbenchCookieName(caseId),
    JSON.stringify({
      reviewChecklist: payload.reviewChecklist,
      reportDraft: payload.reportDraft,
    }),
    cookieOptions(),
  );
}

async function deleteHostedCaseWorkbench(caseId: string) {
  const cookieStore = await cookies();
  cookieStore.delete(getCaseWorkbenchCookieName(caseId));
}

export async function getHostedDemoCases() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(CASES_COOKIE)?.value;
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

  try {
    return enrichCases(JSON.parse(raw) as DemoCaseRecord[]);
  } catch {
    return enrichCases(demoCases);
  }
}

export async function setHostedDemoCases(cases: DemoCaseRecord[]) {
  const cookieStore = await cookies();
  cookieStore.set(
    CASES_COOKIE,
    JSON.stringify(normalizeCases(cases).map(stripCaseWorkbench)),
    cookieOptions(),
  );
}

export async function getHostedDemoDoctors() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(DOCTORS_COOKIE)?.value;

  if (!raw) {
    return seedDoctors();
  }

  try {
    return JSON.parse(raw) as Array<DemoDoctor & { organizationName: string }>;
  } catch {
    return seedDoctors();
  }
}

export async function getHostedDemoPatients() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(PATIENTS_COOKIE)?.value;

  if (!raw) {
    return seedPatients();
  }

  try {
    return JSON.parse(raw) as ReturnType<typeof seedPatients>;
  } catch {
    return seedPatients();
  }
}

async function setHostedDemoPatients(
  patients: Awaited<ReturnType<typeof getHostedDemoPatients>>,
) {
  const cookieStore = await cookies();
  cookieStore.set(
    PATIENTS_COOKIE,
    JSON.stringify([...patients].sort((left, right) => left.code.localeCompare(right.code))),
    cookieOptions(),
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

  const cookieStore = await cookies();
  cookieStore.set(DOCTORS_COOKIE, JSON.stringify(next), cookieOptions());
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
