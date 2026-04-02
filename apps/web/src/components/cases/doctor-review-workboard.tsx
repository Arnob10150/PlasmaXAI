"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { CaseWorkbenchActionState } from "@/app/(workspace)/cases/[id]/actions";
import { Button } from "@/components/ui/button";
import {
  normalizeReportDraft,
  normalizeReviewChecklist,
  type ReportDraft,
  type ReviewChecklistItem,
  type ReviewChecklistLane,
} from "@/lib/review-workspace";

const initialState: CaseWorkbenchActionState = {
  error: null,
  success: null,
};

const laneOrder: ReviewChecklistLane[] = ["Microscopy", "Correlation", "Finalize"];

function SaveBoardButtons() {
  const { pending } = useFormStatus();

  return (
    <div className="flex flex-wrap gap-3">
      <Button name="intent" size="sm" type="submit" value="save" disabled={pending}>
        <i className={`bi ${pending ? "bi-arrow-repeat" : "bi-save2-fill"} text-sm`} aria-hidden="true" />
        {pending ? "Saving..." : "Save report draft"}
      </Button>
      <Button name="intent" size="sm" type="submit" value="finalize" variant="secondary" disabled={pending}>
        <i className="bi bi-check2-square text-sm" aria-hidden="true" />
        Finalize clinical report
      </Button>
    </div>
  );
}

export function DoctorReviewWorkboard({
  caseId,
  initialChecklist,
  initialDraft,
  action,
}: {
  caseId: string;
  initialChecklist: ReviewChecklistItem[];
  initialDraft: ReportDraft;
  action: (
    state: CaseWorkbenchActionState,
    formData: FormData,
  ) => Promise<CaseWorkbenchActionState>;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const [checklist, setChecklist] = useState<ReviewChecklistItem[]>(initialChecklist);
  const [draft, setDraft] = useState<ReportDraft>(initialDraft);
  const [isSessionReady, setIsSessionReady] = useState(false);
  const storageKey = useMemo(() => `plasmaxai-workboard:${caseId}`, [caseId]);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as {
        checklist?: ReviewChecklistItem[];
        draft?: ReportDraft;
      };

      setChecklist(normalizeReviewChecklist(parsed.checklist, []));
      setDraft(normalizeReportDraft(parsed.draft, initialDraft));
    } catch {
      // Keep server defaults if the cached session draft is invalid.
    } finally {
      setIsSessionReady(true);
    }
  }, [initialChecklist, initialDraft, storageKey]);

  useEffect(() => {
    if (!isSessionReady) {
      return;
    }

    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        checklist,
        draft,
      }),
    );
  }, [checklist, draft, isSessionReady, storageKey]);

  const groupedChecklist = useMemo(
    () =>
      laneOrder.map((lane) => ({
        lane,
        items: checklist.filter((item) => item.lane === lane),
      })),
    [checklist],
  );

  const updateItem = (itemId: string, patch: Partial<ReviewChecklistItem>) => {
    setChecklist((current) =>
      current.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    );
  };

  const removeItem = (itemId: string) => {
    setChecklist((current) => current.filter((item) => item.id !== itemId));
  };

  const addItem = (lane: ReviewChecklistLane) => {
    setChecklist((current) => [
      ...current,
      {
        id: `item-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        lane,
        done: false,
        text: lane === "Finalize" ? "Add final sign-out step" : "Add review task",
      },
    ]);
  };

  const completedCount = checklist.filter((item) => item.done).length;

  return (
    <form action={formAction} className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="reviewChecklistJson" value={JSON.stringify(checklist)} />
      <input type="hidden" name="reportDraftJson" value={JSON.stringify(draft)} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-blue-700">
            <i className="bi bi-kanban-fill text-base" aria-hidden="true" />
            Interactive review board
          </p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Checklist and report workspace</h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
            Edit the review checklist, refine the report wording, and finalize the case report when the microscopy review is complete.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
            {completedCount}/{checklist.length} checklist items completed
          </span>
          <span className={`rounded-full border px-3 py-1.5 text-xs font-medium ${draft.finalized ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
            {draft.finalized ? "Final report" : "Editable draft"}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-3">
          {groupedChecklist.map((group) => (
            <section key={group.lane} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{group.lane}</p>
                  <p className="text-xs text-slate-500">
                    {group.lane === "Microscopy"
                      ? "Direct image review tasks"
                      : group.lane === "Correlation"
                        ? "Clinical and interval checks"
                        : "Final sign-out actions"}
                  </p>
                </div>
                <button
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                  onClick={() => addItem(group.lane)}
                  type="button"
                >
                  <i className="bi bi-plus-circle text-xs" aria-hidden="true" />
                  Add
                </button>
              </div>
              <div className="space-y-3">
                {group.items.map((item) => (
                  <div key={item.id} className="rounded-[20px] border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex items-start gap-3">
                      <button
                        className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs ${item.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-transparent"}`}
                        onClick={() => updateItem(item.id, { done: !item.done })}
                        type="button"
                      >
                        <i className="bi bi-check-lg" aria-hidden="true" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <input
                          className={`w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:bg-white ${item.done ? "line-through text-slate-400" : "text-slate-800"}`}
                          value={item.text}
                          onChange={(event) => updateItem(item.id, { text: event.target.value })}
                        />
                      </div>
                      <button
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100"
                        onClick={() => removeItem(item.id)}
                        type="button"
                      >
                        <i className="bi bi-trash3-fill text-xs" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <div className="mb-4">
            <p className="inline-flex items-center gap-2 text-base font-semibold text-slate-950">
              <i className="bi bi-file-earmark-richtext-fill text-sm text-blue-700" aria-hidden="true" />
              Editable clinical report
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Refine the doctor-facing report before download. If left unchanged, PlasmaXAI still generates the report from the current clinical summary automatically.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Clinical summary</label>
              <textarea
                className="min-h-28 w-full rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-blue-400"
                value={draft.clinicalSummary}
                onChange={(event) => setDraft((current) => ({ ...current, clinicalSummary: event.target.value, finalized: false }))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Morphology review note</label>
              <textarea
                className="min-h-28 w-full rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-blue-400"
                value={draft.morphologySummary}
                onChange={(event) => setDraft((current) => ({ ...current, morphologySummary: event.target.value, finalized: false }))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Recommendation</label>
              <textarea
                className="min-h-24 w-full rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-blue-400"
                value={draft.recommendation}
                onChange={(event) => setDraft((current) => ({ ...current, recommendation: event.target.value, finalized: false }))}
              />
            </div>
          </div>

          <div className="mt-4 rounded-[20px] border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
            <p>
              Status: <span className="font-medium text-slate-950">{draft.finalized ? "Finalized report" : "Draft report"}</span>
            </p>
            <p className="mt-2">
              Finalized reports remain downloadable with the saved wording until you edit and save again.
            </p>
          </div>
        </section>
      </div>

      {state.error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.success}</p>
      ) : null}

      <SaveBoardButtons />
    </form>
  );
}
