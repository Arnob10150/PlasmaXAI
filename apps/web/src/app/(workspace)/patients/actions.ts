"use server";

import { revalidatePath } from "next/cache";
import {
  createHostedDemoPatient,
  deleteHostedDemoPatient,
  updateHostedDemoPatient,
} from "@/lib/demo/session-store";
import { hasSupabaseConfig, shouldUseFilesystemLocalStore, shouldUseHostedDemoFallback } from "@/lib/supabase/config";
import {
  createLocalPatient,
  deleteLocalPatient,
  updateLocalPatient,
} from "@/lib/local-cases/store";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";

export interface PatientActionState {
  error: string | null;
  success: string | null;
  redirectTo?: string | null;
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

async function resolveOrganizationId(userId: string) {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, organization_name")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.organization_id) {
    return profile.organization_id as string;
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
    throw new Error("Unable to resolve doctor organization.");
  }

  await supabase
    .from("profiles")
    .update({ organization_id: organization.id })
    .eq("id", userId);

  return organization.id as string;
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
    try {
      const user = await requireUser();
      const organizationId = await resolveOrganizationId(user.id);
      const supabase = await createClient();

      const { error } = await supabase.from("patients").insert({
        patient_code: patientCode,
        full_name: patientName,
        sex,
        date_of_birth: dateOfBirth,
        organization_id: organizationId,
        created_by: user.id,
      });

      if (error) {
        if (error.code === "23505") {
          return { error: "A patient with this code already exists.", success: null, redirectTo: null };
        }

        return { error: error.message, success: null, redirectTo: null };
      }

      await refreshPatientViews();
      return { error: null, success: "Patient record created.", redirectTo: null };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unable to create patient.",
        success: null,
        redirectTo: null,
      };
    }
  }

  try {
    if (shouldUseHostedDemoFallback()) {
      await createHostedDemoPatient({
        patientCode,
        patientName,
        sex,
        dateOfBirth,
      });
    } else {
      await createLocalPatient({
        patientCode,
        patientName,
        sex,
        dateOfBirth,
      });
    }
    await refreshPatientViews();
    return { error: null, success: "Patient record created.", redirectTo: null };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to create patient.",
      success: null,
      redirectTo: null,
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
    try {
      const user = await requireUser();
      const organizationId = await resolveOrganizationId(user.id);
      const supabase = await createClient();

      const { error } = await supabase
        .from("patients")
        .update({
          patient_code: patientCode,
          full_name: patientName,
          sex,
          date_of_birth: dateOfBirth,
        })
        .eq("id", patientId)
        .eq("organization_id", organizationId);

      if (error) {
        if (error.code === "23505") {
          return { error: "Another patient already uses this code.", success: null, redirectTo: null };
        }

        return { error: error.message, success: null, redirectTo: null };
      }

      await refreshPatientViews(patientId);
      return { error: null, success: "Patient record updated.", redirectTo: null };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unable to update patient.",
        success: null,
        redirectTo: null,
      };
    }
  }

  try {
    if (shouldUseHostedDemoFallback()) {
      await updateHostedDemoPatient(patientId, {
        patientCode,
        patientName,
        sex,
        dateOfBirth,
      });
    } else {
      await updateLocalPatient(patientId, {
        patientCode,
        patientName,
        sex,
        dateOfBirth,
      });
    }
    await refreshPatientViews(patientId);
    return { error: null, success: "Patient record updated.", redirectTo: null };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to update patient.",
      success: null,
      redirectTo: null,
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
    try {
      const user = await requireUser();
      const organizationId = await resolveOrganizationId(user.id);
      const supabase = await createClient();

      const { count, error: linkedCaseError } = await supabase
        .from("cases")
        .select("id", { count: "exact", head: true })
        .eq("patient_id", patientId);

      if (linkedCaseError) {
        return { error: linkedCaseError.message, success: null, redirectTo: null };
      }

      if ((count ?? 0) > 0) {
        return {
          error: "This patient still has linked cases. Remove or reassign those cases before deleting the patient profile.",
          success: null,
          redirectTo: null,
        };
      }

      const { error } = await supabase
        .from("patients")
        .delete()
        .eq("id", patientId)
        .eq("organization_id", organizationId);

      if (error) {
        return { error: error.message, success: null, redirectTo: null };
      }

      await refreshPatientViews(patientId);
      return { error: null, success: "Patient record removed.", redirectTo: "/patients" };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unable to delete patient.",
        success: null,
        redirectTo: null,
      };
    }
  }

  try {
    if (shouldUseHostedDemoFallback()) {
      await deleteHostedDemoPatient(patientId);
    } else {
      await deleteLocalPatient(patientId);
    }
    await refreshPatientViews(patientId);
    return { error: null, success: "Patient record removed.", redirectTo: "/patients" };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to delete patient.",
      success: null,
      redirectTo: null,
    };
  }
}
