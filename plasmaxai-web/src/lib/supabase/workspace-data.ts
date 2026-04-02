import { storageConfig } from "@/lib/constants";
import {
  ensureLocalCaseReport,
  listLocalCases,
  listLocalPatients,
} from "@/lib/local-cases/store";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface CaseSummary {
  id: string;
  caseCode: string;
  title: string;
  status: string;
  notes: string | null;
  createdAt: string;
  reviewedAt: string | null;
  patient: {
    id: string;
    code: string;
    name: string | null;
  } | null;
  prediction: {
    predictedClass: string;
    confidence: number;
    riskLevel: string;
    modelVersion: string;
  } | null;
  reports: Array<{
    id: string;
    storagePath: string;
    reportType: string;
    generatedAt: string;
    signedUrl?: string | null;
  }>;
  images: Array<{
    id: string;
    fileName: string;
    storagePath: string;
    mimeType: string | null;
    signedUrl?: string | null;
  }>;
  explanation: {
    counterfactualText: string | null;
    clinicalInsightText: string | null;
    topFeatures: string[];
    heatmapPath: string | null;
  } | null;
  analysis?: {
    probabilities: {
      plasmaxai: number;
      resnet50: number;
      densenet121: number;
      counterfactual: number;
    };
    modalityGates: {
      resnet50: number;
      densenet121: number;
      morphology: number;
      counterfactual: number;
    };
    morphology: Record<string, number>;
  } | null;
}

export interface PatientDetail {
  patient: {
    id: string;
    code: string;
    name: string | null;
    sex?: string | null;
    dateOfBirth?: string | null;
    createdAt?: string;
    updatedAt?: string;
  };
  cases: CaseSummary[];
  averageConfidence: number | null;
  highRiskCount: number;
  latestCase: CaseSummary | null;
  previousCase: CaseSummary | null;
}

interface FetchCaseOptions {
  limit?: number;
  patientId?: string;
  includeReports?: boolean;
  includeImages?: boolean;
  includeExplanation?: boolean;
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function asSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getPastSevenDays() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = startOfDay(new Date());
    date.setDate(date.getDate() - (6 - index));
    return date;
  });
}

function formatShortDay(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

function formatCase(raw: any): CaseSummary {
  const patient = asSingle(raw.patient);
  const prediction = asSingle(raw.prediction);
  const explanation = asSingle(raw.explanation);

  return {
    id: raw.id,
    caseCode: raw.case_code,
    title: raw.title,
    status: raw.status,
    notes: raw.notes ?? null,
    createdAt: raw.created_at,
    reviewedAt: raw.reviewed_at ?? null,
    patient: patient
      ? {
          id: patient.id,
          code: patient.patient_code,
          name: patient.full_name ?? null,
        }
      : null,
    prediction: prediction
      ? {
          predictedClass: prediction.predicted_class,
          confidence: Number(prediction.confidence),
          riskLevel: prediction.risk_level,
          modelVersion: prediction.model_version,
        }
      : null,
    reports: asArray(raw.reports).map((report) => ({
      id: report.id,
      storagePath: report.storage_path,
      reportType: report.report_type,
      generatedAt: report.generated_at,
      signedUrl: report.signed_url ?? null,
    })),
    images: asArray(raw.images).map((image) => ({
      id: image.id,
      fileName: image.file_name,
      storagePath: image.storage_path,
      mimeType: image.mime_type ?? null,
      signedUrl: image.signed_url ?? null,
    })),
    explanation: explanation
      ? {
          counterfactualText: explanation.counterfactual_text ?? null,
          clinicalInsightText: explanation.clinical_insight_text ?? null,
          topFeatures: Array.isArray(explanation.top_features_json)
            ? explanation.top_features_json.map((item: unknown) => String(item))
            : [],
          heatmapPath: explanation.heatmap_path ?? null,
        }
      : null,
    analysis: raw.analysis ?? null,
  };
}

function isBucketPath(value: string) {
  return !/^https?:\/\//i.test(value) && !/^[a-zA-Z]:\\/.test(value);
}

async function addSignedUrls<T extends { storage_path: string }>(
  items: T[],
  bucket: string,
  signedUrlField: string,
) {
  if (!items.length) {
    return [] as Array<T & Record<string, string | null>>;
  }

  const supabase = await createClient();
  const bucketItems = items.filter((item) => isBucketPath(item.storage_path));
  const paths = bucketItems.map((item) => item.storage_path);
  const signedByPath = new Map<string, string | null>();

  if (paths.length) {
    const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 60 * 60);
    data?.forEach((entry, index) => {
      signedByPath.set(paths[index] ?? "", entry?.signedUrl ?? null);
    });
  }

  return items.map((item) => ({
    ...item,
    [signedUrlField]: isBucketPath(item.storage_path) ? (signedByPath.get(item.storage_path) ?? null) : null,
  }));
}

async function fetchCases(options: FetchCaseOptions = {}) {
  if (!hasSupabaseConfig()) {
    let items = await listLocalCases();

    if (options.patientId) {
      items = items.filter((item) => item.patient?.id === options.patientId);
    }

    if (options.limit) {
      items = items.slice(0, options.limit);
    }

    return items.map((item) => ({
      ...item,
      reports: options.includeReports ? item.reports : [],
      images: options.includeImages ? item.images : [],
      explanation: options.includeExplanation ? item.explanation : null,
    }));
  }

  const supabase = await createClient();
  const selectParts = [
    "id",
    "case_code",
    "title",
    "status",
    "notes",
    "created_at",
    "reviewed_at",
    "patient:patients!cases_patient_id_fkey ( id, patient_code, full_name )",
    "prediction:predictions!predictions_case_id_fkey ( predicted_class, confidence, risk_level, model_version )",
  ];

  if (options.includeReports) {
    selectParts.push("reports:reports!reports_case_id_fkey ( id, storage_path, report_type, generated_at )");
  }

  if (options.includeImages) {
    selectParts.push("images:case_images!case_images_case_id_fkey ( id, file_name, storage_path, mime_type )");
  }

  if (options.includeExplanation) {
    selectParts.push("explanation:explanations!explanations_case_id_fkey ( counterfactual_text, clinical_insight_text, top_features_json, heatmap_path )");
  }

  let query = supabase
    .from("cases")
    .select(selectParts.join(", "))
    .order("created_at", { ascending: false });

  if (options.patientId) {
    query = query.eq("patient_id", options.patientId);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [] as CaseSummary[];
  }

  return data.map((rawItem) => {
    const item = rawItem as any;
    return formatCase({
      ...item,
      reports: options.includeReports ? item.reports : [],
      images: options.includeImages ? item.images : [],
      explanation: options.includeExplanation ? item.explanation : null,
    });
  });
}

export function getStatusTone(status: string): BadgeTone {
  switch (status) {
    case "reviewed":
      return "success";
    case "report_ready":
    case "queued_for_inference":
      return "info";
    case "needs_second_review":
    case "follow_up_required":
      return "warning";
    default:
      return "neutral";
  }
}

export function getRiskTone(riskLevel?: string | null): BadgeTone {
  switch ((riskLevel ?? "").toLowerCase()) {
    case "high":
      return "danger";
    case "moderate":
      return "warning";
    case "low":
      return "success";
    default:
      return "neutral";
  }
}

export function formatConfidence(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "Awaiting inference";
  }

  return `${(value * 100).toFixed(2)}%`;
}

export function formatCaseDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function getDashboardData() {
  const cases = await fetchCases();
  const reviewedCases = cases.filter((item) => item.status === "reviewed");
  const pendingCases = cases.filter((item) => item.status !== "reviewed" && item.status !== "report_ready");
  const confidenceValues = cases
    .map((item) => item.prediction?.confidence ?? null)
    .filter((value): value is number => typeof value === "number");
  const averageConfidence = confidenceValues.length
    ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
    : null;
  const highRiskCases = cases.filter((item) => item.prediction?.riskLevel?.toLowerCase() === "high");

  const sevenDays = getPastSevenDays();
  const activityTrend = sevenDays.map((date) => {
    const dayCases = cases.filter((item) => {
      const caseDate = startOfDay(new Date(item.createdAt));
      return caseDate.getTime() === date.getTime();
    });
    const dayConfidence = dayCases
      .map((item) => item.prediction?.confidence ?? null)
      .filter((value): value is number => typeof value === "number");

    return {
      day: formatShortDay(date),
      cases: dayCases.length,
      confidence: dayConfidence.length
        ? Number(((dayConfidence.reduce((sum, value) => sum + value, 0) / dayConfidence.length) * 100).toFixed(1))
        : 0,
    };
  });

  return {
    summary: [
      {
        title: "Cases reviewed",
        value: String(cases.length).padStart(2, "0"),
        delta: `${reviewedCases.length} marked reviewed`,
        tone: "from-blue-50 to-cyan-50",
        icon: "ClipboardList",
      },
      {
        title: "High-risk alerts",
        value: String(highRiskCases.length).padStart(2, "0"),
        delta: highRiskCases.length ? `${highRiskCases.length} need close attention` : "No high-risk alerts yet",
        tone: "from-rose-50 to-amber-50",
        icon: "AlertTriangle",
      },
      {
        title: "Average confidence",
        value: averageConfidence ? `${(averageConfidence * 100).toFixed(1)}%` : "Pending",
        delta: averageConfidence ? "Live across inferred cases" : "Connect inference to populate",
        tone: "from-emerald-50 to-teal-50",
        icon: "Brain",
      },
      {
        title: "Pending review",
        value: String(pendingCases.length).padStart(2, "0"),
        delta: pendingCases.length ? `${pendingCases.length} waiting for doctor action` : "Nothing waiting right now",
        tone: "from-slate-50 to-blue-50",
        icon: "Clock3",
      },
    ],
    activityTrend,
    recentCases: cases.slice(0, 6),
    hasCases: cases.length > 0,
  };
}

export async function getCaseHistoryData() {
  return fetchCases();
}

export async function getPatientsData() {
  if (!hasSupabaseConfig()) {
    const [patients, cases] = await Promise.all([listLocalPatients(), fetchCases()]);

    return patients
      .map((patient) => {
        const patientCases = cases.filter((item) => item.patient?.id === patient.id);
        const latestCase = patientCases[0] ?? null;

        return {
          id: patient.id,
          code: patient.code,
          name: patient.name,
          sex: patient.sex,
          dateOfBirth: patient.dateOfBirth,
          caseCount: patientCases.length,
          latestCaseAt: latestCase?.createdAt ?? patient.updatedAt,
          latestCaseCode: latestCase?.caseCode ?? "No cases yet",
        };
      })
      .sort(
        (left, right) =>
          new Date(right.latestCaseAt).getTime() - new Date(left.latestCaseAt).getTime(),
      );
  }

  const cases = await fetchCases();
  const grouped = new Map<string, {
    id: string;
    code: string;
    name: string | null;
    sex?: string | null;
    dateOfBirth?: string | null;
    caseCount: number;
    latestCaseAt: string;
    latestCaseCode: string;
  }>();

  for (const item of cases) {
    if (!item.patient) {
      continue;
    }

    const existing = grouped.get(item.patient.id);

    if (!existing) {
      grouped.set(item.patient.id, {
        id: item.patient.id,
        code: item.patient.code,
        name: item.patient.name,
        caseCount: 1,
        latestCaseAt: item.createdAt,
        latestCaseCode: item.caseCode,
      });
      continue;
    }

    existing.caseCount += 1;

    if (new Date(item.createdAt).getTime() > new Date(existing.latestCaseAt).getTime()) {
      existing.latestCaseAt = item.createdAt;
      existing.latestCaseCode = item.caseCode;
    }
  }

  return Array.from(grouped.values()).sort(
    (left, right) => new Date(right.latestCaseAt).getTime() - new Date(left.latestCaseAt).getTime(),
  );
}

export async function getPatientDetail(patientId: string): Promise<PatientDetail | null> {
  if (!hasSupabaseConfig()) {
    const [patients, patientCases] = await Promise.all([
      listLocalPatients(),
      fetchCases({ patientId, includeReports: true }),
    ]);
    const patient = patients.find((item) => item.id === patientId) ?? null;

    if (!patient) {
      return null;
    }

    const confidenceValues = patientCases
      .map((item) => item.prediction?.confidence ?? null)
      .filter((value): value is number => typeof value === "number");

    return {
      patient: {
        id: patient.id,
        code: patient.code,
        name: patient.name,
        sex: patient.sex,
        dateOfBirth: patient.dateOfBirth,
        createdAt: patient.createdAt,
        updatedAt: patient.updatedAt,
      },
      cases: patientCases,
      averageConfidence: confidenceValues.length
        ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
        : null,
      highRiskCount: patientCases.filter((item) => item.prediction?.riskLevel?.toLowerCase() === "high").length,
      latestCase: patientCases[0] ?? null,
      previousCase: patientCases[1] ?? null,
    };
  }

  const patientCases = await fetchCases({ patientId, includeReports: true });
  if (!patientCases.length || !patientCases[0].patient) {
    return null;
  }

  const signedCases = await Promise.all(
    patientCases.map(async (item) => {
      if (!item.reports.length) {
        return item;
      }

      const signedReports = await addSignedUrls(
        item.reports.map((report) => ({ ...report, storage_path: report.storagePath })),
        storageConfig.reportBucket,
        "signed_url",
      );

      return {
        ...item,
        reports: signedReports.map((report) => ({
          id: report.id,
          storagePath: report.storagePath,
          reportType: report.reportType,
          generatedAt: report.generatedAt,
          signedUrl: report.signed_url ?? null,
        })),
      };
    }),
  );

  const confidenceValues = signedCases
    .map((item) => item.prediction?.confidence ?? null)
    .filter((value): value is number => typeof value === "number");

  return {
    patient: signedCases[0].patient!,
    cases: signedCases,
    averageConfidence: confidenceValues.length
      ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
      : null,
    highRiskCount: signedCases.filter((item) => item.prediction?.riskLevel?.toLowerCase() === "high").length,
    latestCase: signedCases[0] ?? null,
    previousCase: signedCases[1] ?? null,
  };
}

export async function getReportsData() {
  if (!hasSupabaseConfig()) {
    const localCases = await listLocalCases();

    for (const item of localCases) {
      if (item.prediction && !item.reports.length) {
        await ensureLocalCaseReport(item.id);
      }
    }

    const refreshedCases = await listLocalCases();
    return refreshedCases.flatMap((item) =>
      item.reports.map((report) => ({
        id: report.id,
        title: `${item.caseCode} report`,
        generatedAt: report.generatedAt,
        storagePath: report.storagePath,
        reportType: report.reportType,
        patientCode: item.patient?.code ?? "Unknown",
        patientName: item.patient?.name ?? null,
        caseId: item.id,
        caseCode: item.caseCode,
        signedUrl: report.signedUrl ?? null,
      })),
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .select(
      "id, storage_path, report_type, generated_at, case:cases!reports_case_id_fkey ( id, case_code, patient:patients!cases_patient_id_fkey ( patient_code, full_name ) )",
    )
    .order("generated_at", { ascending: false });

  if (error || !data) {
    return [] as Array<{
      id: string;
      title: string;
      generatedAt: string;
      storagePath: string;
      reportType: string;
      patientCode: string;
      patientName: string | null;
      caseId: string;
      caseCode: string;
      signedUrl: string | null;
    }>;
  }

  const signedReports = await addSignedUrls(data, storageConfig.reportBucket, "signed_url");

  return signedReports.map((report: any) => ({
    id: report.id,
    title: `${report.case?.case_code ?? "Case"} report`,
    generatedAt: report.generated_at,
    storagePath: report.storage_path,
    reportType: report.report_type,
    patientCode: report.case?.patient?.patient_code ?? "Unknown",
    patientName: report.case?.patient?.full_name ?? null,
    caseId: report.case?.id ?? "",
    caseCode: report.case?.case_code ?? "Unknown",
    signedUrl: report.signed_url ?? null,
  }));
}

export async function getCaseDetail(caseId: string) {
  if (!hasSupabaseConfig()) {
    const localCases = await listLocalCases();
    const localCase = localCases.find((item) => item.id === caseId) ?? null;

    if (!localCase) {
      return null;
    }

    if (localCase.prediction && !localCase.reports.length) {
      return {
        ...localCase,
        reports: [
          {
            id: `report-${localCase.id}`,
            storagePath: `/api/local-report-file/${localCase.id}`,
            reportType: "pdf",
            generatedAt: localCase.reviewedAt ?? localCase.createdAt,
            signedUrl: `/api/local-report-file/${localCase.id}`,
          },
        ],
      };
    }

    return localCase;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cases")
    .select(
      "id, case_code, title, status, notes, created_at, reviewed_at, patient:patients!cases_patient_id_fkey ( id, patient_code, full_name ), prediction:predictions!predictions_case_id_fkey ( predicted_class, confidence, risk_level, model_version ), reports:reports!reports_case_id_fkey ( id, storage_path, report_type, generated_at ), images:case_images!case_images_case_id_fkey ( id, file_name, storage_path, mime_type ), explanation:explanations!explanations_case_id_fkey ( counterfactual_text, clinical_insight_text, top_features_json, heatmap_path )",
    )
    .eq("id", caseId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const [images, reports] = await Promise.all([
    addSignedUrls(asArray(data.images), storageConfig.caseImageBucket, "signed_url"),
    addSignedUrls(asArray(data.reports), storageConfig.reportBucket, "signed_url"),
  ]);

  return formatCase({
    ...data,
    images,
    reports,
  });
}
