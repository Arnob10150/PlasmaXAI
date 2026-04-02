"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { PatientActionState } from "@/app/(workspace)/patients/actions";
import { Button } from "@/components/ui/button";

const initialState: PatientActionState = {
  error: null,
  success: null,
};

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full sm:w-auto" disabled={pending} type="submit">
      <i className={`bi ${pending ? "bi-arrow-repeat" : "bi-save2-fill"} text-sm`} aria-hidden="true" />
      {pending ? "Saving..." : "Save patient profile"}
    </Button>
  );
}

function DeleteButton() {
  return (
    <Button className="w-full sm:w-auto" type="submit" variant="secondary">
      <i className="bi bi-trash3-fill text-sm" aria-hidden="true" />
      Remove patient
    </Button>
  );
}

export function PatientProfileForm({
  patient,
  updateAction,
  deleteAction,
}: {
  patient: {
    id: string;
    code: string;
    name: string | null;
    sex?: string | null;
    dateOfBirth?: string | null;
  };
  updateAction: (state: PatientActionState, formData: FormData) => Promise<PatientActionState>;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  const [updateState, updateFormAction] = useActionState(updateAction, initialState);

  return (
    <div className="space-y-4">
      <form action={updateFormAction} className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <input name="patientId" type="hidden" value={patient.id} />
        <div className="mb-4">
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-950">
            <i className="bi bi-person-lines-fill text-base text-blue-700" aria-hidden="true" />
            Patient details
          </h2>
          <p className="mt-1 text-sm text-slate-500">Update patient identity details used across saved case history.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <i className="bi bi-person-vcard-fill text-sm text-blue-700" aria-hidden="true" />
              Patient code
            </label>
            <input className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4" defaultValue={patient.code} name="patientCode" />
          </div>
          <div>
            <label className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <i className="bi bi-person-fill text-sm text-blue-700" aria-hidden="true" />
              Patient name
            </label>
            <input className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4" defaultValue={patient.name ?? ""} name="patientName" />
          </div>
          <div>
            <label className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <i className="bi bi-gender-ambiguous text-sm text-blue-700" aria-hidden="true" />
              Sex
            </label>
            <select className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4" defaultValue={patient.sex ?? ""} name="sex">
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
            <input className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4" defaultValue={patient.dateOfBirth ?? ""} name="dateOfBirth" type="date" />
          </div>
        </div>
        {updateState.error ? (
          <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{updateState.error}</p>
        ) : null}
        {updateState.success ? (
          <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{updateState.success}</p>
        ) : null}
        <div className="mt-4">
          <SaveButton />
        </div>
      </form>

      <form action={deleteAction} className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <input name="patientId" type="hidden" value={patient.id} />
        <div className="mb-3">
          <h3 className="inline-flex items-center gap-2 text-base font-semibold text-slate-950">
            <i className="bi bi-trash3-fill text-sm text-rose-600" aria-hidden="true" />
            Remove patient record
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            This removes the patient from the directory and detaches linked cases from that patient name.
          </p>
        </div>
        <DeleteButton />
      </form>
    </div>
  );
}
