"use server";

import { revalidatePath } from "next/cache";
import { updateLocalCaseReview } from "@/lib/local-cases/store";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";

export async function updateCaseReviewAction(formData: FormData) {
  const caseId = typeof formData.get("caseId") === "string" ? String(formData.get("caseId")) : "";
  const status = typeof formData.get("status") === "string" ? String(formData.get("status")) : "new";
  const notes = typeof formData.get("notes") === "string" ? String(formData.get("notes")).trim() : "";

  if (!hasSupabaseConfig()) {
    if (caseId) {
      await updateLocalCaseReview({
        caseId,
        status,
        notes: notes || null,
      });
      revalidatePath(`/cases/${caseId}`);
    }
    revalidatePath("/dashboard");
    revalidatePath("/history");
    revalidatePath("/patients");
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
      status,
    },
  });

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/dashboard");
  revalidatePath("/history");
}
