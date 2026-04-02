"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { PatientActionState } from "@/app/(workspace)/patients/actions";
import { Button } from "@/components/ui/button";

const initialState: PatientActionState = {
  error: null,
  success: null,
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full sm:w-auto" disabled={pending} type="submit">
      <i className={`bi ${pending ? "bi-arrow-repeat" : "bi-person-plus-fill"} text-sm`} aria-hidden="true" />
      {pending ? "Saving..." : "Create patient"}
    </Button>
  );
}

export function PatientCreateForm({
  action,
}: {
  action: (state: PatientActionState, formData: FormData) => Promise<PatientActionState>;
}) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="grid gap-4 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <i className="bi bi-person-vcard-fill text-sm text-blue-700" aria-hidden="true" />
            Patient code
          </label>
          <input
            className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4"
            name="patientCode"
            placeholder="PT-0102"
          />
        </div>
        <div>
          <label className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <i className="bi bi-person-fill text-sm text-blue-700" aria-hidden="true" />
            Patient name
          </label>
          <input
            className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4"
            name="patientName"
            placeholder="Optional patient name"
          />
        </div>
        <div>
          <label className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <i className="bi bi-gender-ambiguous text-sm text-blue-700" aria-hidden="true" />
            Sex
          </label>
          <select className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4" name="sex">
            <option value="">Select</option>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div>
          <label className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <i className="bi bi-calendar3 text-sm text-blue-700" aria-hidden="true" />
            Date of birth
          </label>
          <input
            className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4"
            name="dateOfBirth"
            type="date"
          />
        </div>
      </div>
      <div className="flex flex-col justify-between gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
        <div>
          <p className="text-sm font-semibold text-slate-950">Patient registry</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Create a patient first, then link new analyses to that patient from the case intake flow.
          </p>
        </div>
        {state.error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>
        ) : null}
        {state.success ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.success}</p>
        ) : null}
        <SubmitButton />
      </div>
    </form>
  );
}
