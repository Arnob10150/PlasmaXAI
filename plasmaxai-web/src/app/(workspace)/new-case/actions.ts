"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { buildCaseReportPdf } from "@/lib/reports/pdf-report";
import { storageConfig } from "@/lib/constants";
import { queueCaseInference, type InferenceResult } from "@/lib/inference/service";
import { createLocalCase, updateLocalCaseInference } from "@/lib/local-cases/store";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";

export interface CreateCaseState {
  error: string | null;
}

function toNullableString(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value.trim() : "";
  return next.length ? next : null;
}

function buildCaseCode() {
  const stamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 900 + 100).toString();
  return `PX-${stamp}${random}`;
}

function sanitizeFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function resolveOrganizationId(userId: string) {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, organization_name, full_name, specialization")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.organization_id) {
    return profile;
  }

  const organizationName = profile?.organization_name || "Independent Practice";
  const { data: organization, error } = await supabase
    .from("organizations")
    .insert({
      name: organizationName,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error || !organization) {
    throw new Error("Unable to create doctor organization.");
  }

  await supabase
    .from("profiles")
    .update({ organization_id: organization.id })
    .eq("id", userId);

  return {
    ...profile,
    organization_id: organization.id,
  };
}

async function uploadCaseImage(options: {
  file: File;
  patientCode: string;
  caseCode: string;
  userId: string;
}) {
  const { file, patientCode, caseCode, userId } = options;
  const supabase = await createClient();
  const sanitizedFileName = sanitizeFileName(file.name || `case-image-${Date.now()}.png`);
  const storagePath = `${userId}/${patientCode}/${caseCode}/${Date.now()}-${sanitizedFileName}`;

  const { error } = await supabase.storage
    .from(storageConfig.caseImageBucket)
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: file.type || undefined,
      upsert: false,
    });

  if (error) {
    throw new Error(
      `Unable to upload image. Make sure the '${storageConfig.caseImageBucket}' storage bucket exists and storage policies were applied.`,
    );
  }

  return {
    storagePath,
    fileName: sanitizedFileName,
    mimeType: file.type || null,
  };
}

async function createPdfReport(options: {
  caseId: string;
  caseCode: string;
  caseTitle: string;
  patientCode: string;
  patientName: string | null;
  doctorName: string;
  specialization: string | null;
  clinicalNote: string | null;
  imagePath: string | null;
  inferenceResult: InferenceResult;
  userId: string;
}) {
  const supabase = await createClient();
  const reportPdf = await buildCaseReportPdf({
    caseCode: options.caseCode,
    caseTitle: options.caseTitle,
    patientCode: options.patientCode,
    patientName: options.patientName,
    doctorName: options.doctorName,
    specialization: options.specialization,
    clinicalNote: options.clinicalNote,
    imagePath: options.imagePath,
    result: options.inferenceResult,
  });

  const reportPath = `${options.userId}/${options.patientCode}/${options.caseCode}/report-${Date.now()}.pdf`;
  const { error } = await supabase.storage
    .from(storageConfig.reportBucket)
    .upload(reportPath, reportPdf, {
      cacheControl: "3600",
      contentType: "application/pdf",
      upsert: false,
    });

  if (error) {
    throw new Error(
      `Unable to upload report. Make sure the '${storageConfig.reportBucket}' storage bucket exists and storage policies were applied.`,
    );
  }

  await supabase.from("reports").insert({
    case_id: options.caseId,
    storage_path: reportPath,
    report_type: "pdf",
  });
}

export async function createCaseAction(
  _prevState: CreateCaseState,
  formData: FormData,
): Promise<CreateCaseState> {
  const patientCode = toNullableString(formData.get("patientCode"));
  const patientName = toNullableString(formData.get("patientName"));
  const sex = toNullableString(formData.get("sex"));
  const dateOfBirth = toNullableString(formData.get("dateOfBirth"));
  const caseTitle = toNullableString(formData.get("caseTitle"));
  const clinicalNote = toNullableString(formData.get("clinicalNote"));
  const imageReference = toNullableString(formData.get("imageReference"));
  const imageFile = formData.get("imageFile");
  const uploadedFile = imageFile instanceof File && imageFile.size > 0 ? imageFile : null;

  if (!patientCode || !caseTitle) {
    return { error: "Patient code and case title are required." };
  }

  if (!hasSupabaseConfig()) {
    let localCaseId: string | null = null;

    try {
      const localCase = await createLocalCase({
        patientCode,
        patientName,
        caseTitle,
        clinicalNote,
        imageFile: uploadedFile,
        imageReference,
      });

      const localImagePath = localCase.images[0]?.storagePath ?? null;

      if (localImagePath) {
        try {
          const result = await queueCaseInference({
            caseId: localCase.id,
            caseCode: localCase.caseCode,
            patientCode,
            title: caseTitle,
            imagePath: localImagePath,
          });

          if (result.queued && result.result) {
            await updateLocalCaseInference(localCase.id, {
              predictedClass: result.result.prediction.predictedClassText,
              confidence: result.result.prediction.confidence,
              riskLevel: result.result.prediction.riskLevel,
              modelVersion: result.result.modelVersion,
              counterfactualText: result.result.explanation.counterfactualText,
              clinicalInsightText: result.result.explanation.clinicalInsightText,
              topFeatures: result.result.explanation.topFeatures,
              analysis: {
                probabilities: result.result.probabilities,
                modalityGates: result.result.modalityGates,
                morphology: result.result.morphology,
              },
            });
          }
        } catch {
          // Local mode stays usable even without the inference API.
        }
      }

      localCaseId = localCase.id;
      revalidatePath("/dashboard");
      revalidatePath("/history");
      revalidatePath("/patients");
      revalidatePath("/reports");
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unable to create local case.",
      };
    }

    redirect(`/cases/${localCaseId}`);
  }

  const user = await requireUser();
  const supabase = await createClient();

  let createdCaseId: string | null = null;

  try {
    const profile = await resolveOrganizationId(user.id);
    const organizationId = profile.organization_id as string;
    const { data: existingPatient } = await supabase
      .from("patients")
      .select("id, full_name, sex, date_of_birth")
      .eq("organization_id", organizationId)
      .eq("patient_code", patientCode)
      .maybeSingle();

    let patientId = existingPatient?.id as string | undefined;

    if (!patientId) {
      const { data: patient, error: patientError } = await supabase
        .from("patients")
        .insert({
          patient_code: patientCode,
          full_name: patientName,
          sex,
          date_of_birth: dateOfBirth,
          organization_id: organizationId,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (patientError || !patient) {
        return { error: patientError?.message ?? "Unable to create patient." };
      }

      patientId = patient.id as string;
    } else if (
      existingPatient &&
      ((patientName && !existingPatient.full_name) ||
        (sex && !existingPatient.sex) ||
        (dateOfBirth && !existingPatient.date_of_birth))
    ) {
      await supabase
        .from("patients")
        .update({
          full_name: existingPatient.full_name ?? patientName,
          sex: existingPatient.sex ?? sex,
          date_of_birth: existingPatient.date_of_birth ?? dateOfBirth,
        })
        .eq("id", patientId);
    }

    const caseCode = buildCaseCode();
    const uploadedImage = uploadedFile
      ? await uploadCaseImage({
          file: uploadedFile,
          patientCode,
          caseCode,
          userId: user.id,
        })
      : null;

    const { data: createdCase, error: caseError } = await supabase
      .from("cases")
      .insert({
        case_code: caseCode,
        patient_id: patientId,
        doctor_id: user.id,
        title: caseTitle,
        status: "new",
        notes: clinicalNote,
      })
      .select("id")
      .single();

    if (caseError || !createdCase) {
      return { error: caseError?.message ?? "Unable to create case." };
    }

    createdCaseId = createdCase.id as string;

    let linkedImagePath: string | null = null;

    if (uploadedImage) {
      linkedImagePath = uploadedImage.storagePath;
      await supabase.from("case_images").insert({
        case_id: createdCaseId,
        storage_path: uploadedImage.storagePath,
        file_name: uploadedImage.fileName,
        mime_type: uploadedImage.mimeType,
      });
    } else if (imageReference) {
      linkedImagePath = imageReference;
      const fileName = imageReference.split(/[\\/]/).pop() || imageReference;
      await supabase.from("case_images").insert({
        case_id: createdCaseId,
        storage_path: imageReference,
        file_name: fileName,
        mime_type: null,
      });
    }

    let inferenceCompleted = false;

    if (linkedImagePath) {
      try {
        const result = await queueCaseInference({
          caseId: createdCaseId,
          caseCode,
          patientCode,
          title: caseTitle,
          imagePath: linkedImagePath,
          imageBucket: storageConfig.caseImageBucket,
        });

        if (result.queued && result.result) {
          inferenceCompleted = true;
          await supabase.from("predictions").upsert(
            {
              case_id: createdCaseId,
              predicted_class: result.result.prediction.predictedClassText,
              confidence: result.result.prediction.confidence,
              risk_level: result.result.prediction.riskLevel,
              model_version: result.result.modelVersion,
            },
            { onConflict: "case_id" },
          );
          await supabase.from("explanations").upsert(
            {
              case_id: createdCaseId,
              counterfactual_text: result.result.explanation.counterfactualText,
              clinical_insight_text: result.result.explanation.clinicalInsightText,
              top_features_json: result.result.explanation.topFeatures,
              heatmap_path: null,
            },
            { onConflict: "case_id" },
          );
          await createPdfReport({
            caseId: createdCaseId,
            caseCode,
            caseTitle,
            patientCode,
            patientName,
            doctorName: (profile.full_name as string | null) ?? user.email?.split("@")[0] ?? "Doctor",
            specialization: (profile.specialization as string | null) ?? null,
            clinicalNote,
            imagePath: linkedImagePath,
            inferenceResult: result.result,
            userId: user.id,
          });
          await supabase
            .from("cases")
            .update({ status: "report_ready" })
            .eq("id", createdCaseId);
        } else if (result.queued) {
          await supabase
            .from("cases")
            .update({ status: "queued_for_inference" })
            .eq("id", createdCaseId);
        }
      } catch {
        inferenceCompleted = false;
      }
    }

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      case_id: createdCaseId,
      action: inferenceCompleted
        ? "case_created_inferred_reported"
        : uploadedImage
          ? "case_created_with_upload"
          : "case_created",
      metadata: {
        case_code: caseCode,
        patient_code: patientCode,
      },
    });

    revalidatePath("/dashboard");
    revalidatePath("/history");
    revalidatePath("/patients");
    revalidatePath("/reports");
    revalidatePath(`/cases/${createdCaseId}`);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to create case.",
    };
  }

  redirect(`/cases/${createdCaseId}`);
}

