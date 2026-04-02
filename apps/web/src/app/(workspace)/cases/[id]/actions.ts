"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  deleteHostedDemoCase,
  updateHostedDemoCaseReview,
  updateHostedDemoCaseWorkbench,
} from "@/lib/demo/session-store";
import { deleteLocalCase, updateLocalCaseReview, updateLocalCaseWorkbench } from "@/lib/local-cases/store";
import { buildDefaultReportDraft, buildDefaultReviewChecklist, normalizeReportDraft, normalizeReviewChecklist } from "@/lib/review-workspace";
import { hasSupabaseConfig, shouldUseFilesystemLocalStore, shouldUseHostedDemoFallback } from "@/lib/supabase/config";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export async function updateCaseReviewAction(formData: FormData) {
  const caseId = typeof formData.get("caseId") === "string" ? String(formData.get("caseId")) : "";
  const title = typeof formData.get("title") === "string" ? String(formData.get("title")).trim() : "";
  const status = typeof formData.get("status") === "string" ? String(formData.get("status")) : "new";
  const notes = typeof formData.get("notes") === "string" ? String(formData.get("notes")).trim() : "";

  if (!hasSupabaseConfig()) {
    if (caseId) {
      if (shouldUseHostedDemoFallback()) {
        await updateHostedDemoCaseReview({
          caseId,
          title: title || null,
          status,
          notes: notes || null,
        });
      } else {
        await updateLocalCaseReview({
          caseId,
          title: title || null,
          status,
          notes: notes || null,
        });
      }
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
    if (shouldUseHostedDemoFallback()) {
      await deleteHostedDemoCase(caseId);
    } else {
      await deleteLocalCase(caseId);
    }
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

export interface CaseWorkbenchActionState {
  error: string | null;
  success: string | null;
}

export async function saveCaseWorkbenchAction(
  _prevState: CaseWorkbenchActionState,
  formData: FormData,
): Promise<CaseWorkbenchActionState> {
  const caseId = typeof formData.get("caseId") === "string" ? String(formData.get("caseId")) : "";
  const intent = typeof formData.get("intent") === "string" ? String(formData.get("intent")) : "save";
  const checklistJson = typeof formData.get("reviewChecklistJson") === "string" ? String(formData.get("reviewChecklistJson")) : "[]";
  const reportDraftJson = typeof formData.get("reportDraftJson") === "string" ? String(formData.get("reportDraftJson")) : "{}";

  if (!caseId) {
    return { error: "Case record was not found.", success: null };
  }

  try {
    const parsedChecklist = normalizeReviewChecklist(JSON.parse(checklistJson), []);
    const parsedDraft = normalizeReportDraft(
      JSON.parse(reportDraftJson),
      buildDefaultReportDraft({
        predictedClass: null,
        confidence: null,
        topFeatures: [],
        doctorInsight: null,
        recommendedAction: null,
      }),
    );

    const nextDraft = {
      ...parsedDraft,
      finalized: intent === "finalize",
      finalizedAt: intent === "finalize" ? new Date().toISOString() : null,
    };

    if (!hasSupabaseConfig()) {
      if (shouldUseHostedDemoFallback()) {
        await updateHostedDemoCaseWorkbench({
          caseId,
          reviewChecklist: parsedChecklist.length ? parsedChecklist : buildDefaultReviewChecklist(),
          reportDraft: nextDraft,
        });
      } else {
        await updateLocalCaseWorkbench({
          caseId,
          reviewChecklist: parsedChecklist.length ? parsedChecklist : buildDefaultReviewChecklist(),
          reportDraft: nextDraft,
        });
      }
    }

    revalidatePath(`/cases/${caseId}`);
    revalidatePath("/history");

    return {
      error: null,
      success: intent === "finalize" ? "Clinical report finalized." : "Review board saved.",
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to save the review workspace.",
      success: null,
    };
  }
}
