"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import {
  createLocalPatient,
  deleteLocalPatient,
  updateLocalPatient,
} from "@/lib/local-cases/store";

export interface PatientActionState {
  error: string | null;
  success: string | null;
}

function toNullableString(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value.trim() : "";
  return next.length ? next : null;
}

async function refreshPatientViews(patientId?: string) {
  revalidatePath("/patients");
  if (patientId) {
    revalidatePath(`/patients/${patientId}`);
  }
  revalidatePath("/new-case");
  revalidatePath("/history");
  revalidatePath("/dashboard");
}

export async function createPatientAction(
  _prevState: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const patientCode = toNullableString(formData.get("patientCode"));
  const patientName = toNullableString(formData.get("patientName"));
  const sex = toNullableString(formData.get("sex"));
  const dateOfBirth = toNullableString(formData.get("dateOfBirth"));

  if (!patientCode) {
    return { error: "Patient code is required.", success: null };
  }

  if (hasSupabaseConfig()) {
    return { error: "Patient CRUD is not wired for the cloud workspace yet.", success: null };
  }

  try {
    await createLocalPatient({
      patientCode,
      patientName,
      sex,
      dateOfBirth,
    });
    await refreshPatientViews();
    return { error: null, success: "Patient record created." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to create patient.",
      success: null,
    };
  }
}

export async function updatePatientAction(
  _prevState: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const patientId = toNullableString(formData.get("patientId"));
  const patientCode = toNullableString(formData.get("patientCode"));
  const patientName = toNullableString(formData.get("patientName"));
  const sex = toNullableString(formData.get("sex"));
  const dateOfBirth = toNullableString(formData.get("dateOfBirth"));

  if (!patientId || !patientCode) {
    return { error: "Patient ID and code are required.", success: null };
  }

  if (hasSupabaseConfig()) {
    return { error: "Patient CRUD is not wired for the cloud workspace yet.", success: null };
  }

  try {
    await updateLocalPatient(patientId, {
      patientCode,
      patientName,
      sex,
      dateOfBirth,
    });
    await refreshPatientViews(patientId);
    return { error: null, success: "Patient record updated." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to update patient.",
      success: null,
    };
  }
}

export async function deletePatientAction(
  _prevState: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const patientId = toNullableString(formData.get("patientId"));

  if (!patientId) {
    return { error: "Patient ID is required.", success: null };
  }

  if (hasSupabaseConfig()) {
    return { error: "Patient CRUD is not wired for the cloud workspace yet.", success: null };
  }

  try {
    await deleteLocalPatient(patientId);
    await refreshPatientViews(patientId);
    return { error: null, success: "Patient record removed." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to delete patient.",
      success: null,
    };
  }
}

export async function deletePatientRedirectAction(formData: FormData) {
  const patientId = toNullableString(formData.get("patientId"));

  if (!patientId) {
    throw new Error("Patient ID is required.");
  }

  if (hasSupabaseConfig()) {
    throw new Error("Patient CRUD is not wired for the cloud workspace yet.");
  }

  await deleteLocalPatient(patientId);
  await refreshPatientViews(patientId);
  redirect("/patients");
}
