"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteLocalCase, updateLocalCaseReview } from "@/lib/local-cases/store";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export async function updateCaseReviewAction(formData: FormData) {
  const caseId = typeof formData.get("caseId") === "string" ? String(formData.get("caseId")) : "";
  const title = typeof formData.get("title") === "string" ? String(formData.get("title")).trim() : "";
  const status = typeof formData.get("status") === "string" ? String(formData.get("status")) : "new";
  const notes = typeof formData.get("notes") === "string" ? String(formData.get("notes")).trim() : "";

  if (!hasSupabaseConfig()) {
    if (caseId) {
      await updateLocalCaseReview({
        caseId,
        title: title || null,
        status,
        notes: notes || null,
      });
      revalidatePath(`/cases/${caseId}`);
    }
    revalidatePath("/dashboard");
    revalidatePath("/history");
    revalidatePath("/patients");
    revalidatePath("/reports");
    return;
  }

  const user = await requireUser();
  const supabase = await createClient();

  if (!caseId) {
    return;
  }

  await supabase
    .from("cases")
    .update({
      title: title || null,
      status,
      notes: notes || null,
      reviewed_at: status === "reviewed" || status === "report_ready" ? new Date().toISOString() : null,
    })
    .eq("id", caseId);

  await supabase.from("audit_logs").insert({
    user_id: user.id,
    case_id: caseId,
    action: "case_updated",
    metadata: {
      title,
      status,
    },
  });

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/dashboard");
  revalidatePath("/history");
  revalidatePath("/patients");
  revalidatePath("/reports");
}

export async function deleteCaseAction(formData: FormData) {
  const caseId = typeof formData.get("caseId") === "string" ? String(formData.get("caseId")) : "";
  const redirectTo = typeof formData.get("redirectTo") === "string" ? String(formData.get("redirectTo")) : "";

  if (!caseId) {
    return;
  }

  if (!hasSupabaseConfig()) {
    await deleteLocalCase(caseId);
  } else {
    const user = await requireUser();
    const supabase = await createClient();

    await supabase.from("audit_logs").delete().eq("case_id", caseId);
    await supabase.from("reports").delete().eq("case_id", caseId);
    await supabase.from("case_images").delete().eq("case_id", caseId);
    await supabase.from("explanations").delete().eq("case_id", caseId);
    await supabase.from("predictions").delete().eq("case_id", caseId);
    await supabase.from("cases").delete().eq("id", caseId);
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      case_id: null,
      action: "case_deleted",
      metadata: {
        caseId,
      },
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/history");
  revalidatePath("/patients");
  revalidatePath("/reports");

  if (redirectTo) {
    redirect(redirectTo);
  }
}
