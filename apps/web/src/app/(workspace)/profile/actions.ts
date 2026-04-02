"use server";

import { revalidatePath } from "next/cache";
import { updateHostedDemoDoctorProfile } from "@/lib/demo/session-store";
import { updateLocalDoctorProfile } from "@/lib/local-doctors/store";
import { hasSupabaseConfig, shouldUseFilesystemLocalStore, shouldUseHostedDemoFallback } from "@/lib/supabase/config";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export interface ProfileActionState {
  error: string | null;
  success: string | null;
}

function toRequiredString(value: FormDataEntryValue | null, fieldName: string) {
  const next = typeof value === "string" ? value.trim() : "";
  if (!next) {
    throw new Error(`${fieldName} is required.`);
  }
  return next;
}

export async function updateProfileAction(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  try {
    const fullName = toRequiredString(formData.get("fullName"), "Full name");
    const specialization = toRequiredString(formData.get("specialization"), "Specialization");
    const organizationName = toRequiredString(formData.get("organizationName"), "Organization");
    const user = await requireUser();

    if (!hasSupabaseConfig()) {
      if (shouldUseHostedDemoFallback()) {
        await updateHostedDemoDoctorProfile(user.email ?? "", {
          fullName,
          specialization,
          organizationName,
        });
      } else if (shouldUseFilesystemLocalStore()) {
        await updateLocalDoctorProfile(user.email ?? "", {
          fullName,
          specialization,
          organizationName,
        });
      }
      revalidatePath("/profile");
      revalidatePath("/dashboard");
      revalidatePath("/patients");
      revalidatePath("/history");
      revalidatePath("/reports");
      return {
        error: null,
        success: "Profile updated successfully.",
      };
    }

    const supabase = await createClient();
    await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          full_name: fullName,
          specialization,
          organization_name: organizationName,
        },
        { onConflict: "id" },
      );

    revalidatePath("/profile");
    revalidatePath("/dashboard");
    revalidatePath("/patients");
    revalidatePath("/history");
    revalidatePath("/reports");

    return {
      error: null,
      success: "Profile updated successfully.",
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to update the doctor profile.",
      success: null,
    };
  }
}
