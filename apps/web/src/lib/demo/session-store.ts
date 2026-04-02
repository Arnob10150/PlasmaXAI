import { cookies } from "next/headers";
import {
  demoCases,
  demoDoctors,
  type DemoCaseRecord,
  type DemoDoctor,
} from "@/lib/demo/mock-data";
import type { InferenceResult } from "@/lib/inference/service";
import { buildDefaultReportDraft, buildDefaultReviewChecklist } from "@/lib/review-workspace";

const CASES_COOKIE = "plasmaxai-demo-cases";
const DOCTORS_COOKIE = "plasmaxai-demo-doctors";

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

function normalizeCases(items: DemoCaseRecord[]) {
  return [...items].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

export async function getHostedDemoCases() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(CASES_COOKIE)?.value;

  if (!raw) {
    return normalizeCases(demoCases);
  }

  try {
    return normalizeCases(JSON.parse(raw) as DemoCaseRecord[]);
  } catch {
    return normalizeCases(demoCases);
  }
}

export async function setHostedDemoCases(cases: DemoCaseRecord[]) {
  const cookieStore = await cookies();
  cookieStore.set(CASES_COOKIE, JSON.stringify(normalizeCases(cases)), cookieOptions());
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
  const seed = demoCases[cases.length % demoCases.length] ?? demoCases[0];
  const now = new Date().toISOString();
  const suffix = (options.caseId?.replace(/^case-/, "") || Date.now().toString().slice(-6)).slice(-8);
  const normalizedImageSource = options.imageDataUrl?.trim() || options.imageReference?.trim() || null;
  const normalizedFileName =
    options.imageFileName?.trim() ||
    normalizedImageSource?.split(/[\\/]/).pop() ||
    `case-image-${suffix}.png`;
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
      id: `patient-${options.patientCode.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
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

  await setHostedDemoCases([nextCase, ...cases]);
  return nextCase;
}
