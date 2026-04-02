"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ProfileActionState } from "@/app/(workspace)/profile/actions";
import { Button } from "@/components/ui/button";

const initialState: ProfileActionState = {
  error: null,
  success: null,
};

function SaveProfileButton() {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full sm:w-auto" disabled={pending} type="submit">
      <i className={`bi ${pending ? "bi-arrow-repeat" : "bi-floppy-fill"} text-sm`} aria-hidden="true" />
      {pending ? "Saving..." : "Save profile"}
    </Button>
  );
}

export function DoctorProfileForm({
  doctor,
  action,
}: {
  doctor: {
    fullName: string;
    email: string;
    specialization: string;
    organizationName: string;
  };
  action: (state: ProfileActionState, formData: FormData) => Promise<ProfileActionState>;
}) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-950">
            <i className="bi bi-person-workspace text-base text-blue-700" aria-hidden="true" />
            Doctor profile and account
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Update the account identity shown in the workspace header, reports, and case documentation.
          </p>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
          Clinician-facing workspace profile
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <label className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <i className="bi bi-person-vcard-fill text-sm text-blue-700" aria-hidden="true" />
            Full name
          </label>
          <input
            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4"
            defaultValue={doctor.fullName}
            name="fullName"
          />
        </div>

        <div>
          <label className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <i className="bi bi-envelope-fill text-sm text-blue-700" aria-hidden="true" />
            Work email
          </label>
          <div className="flex h-12 items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-600">
            {doctor.email}
          </div>
        </div>

        <div>
          <label className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <i className="bi bi-heart-pulse-fill text-sm text-blue-700" aria-hidden="true" />
            Specialization
          </label>
          <input
            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4"
            defaultValue={doctor.specialization}
            name="specialization"
          />
        </div>

        <div>
          <label className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <i className="bi bi-hospital-fill text-sm text-blue-700" aria-hidden="true" />
            Organization
          </label>
          <input
            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4"
            defaultValue={doctor.organizationName}
            name="organizationName"
          />
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-700">Displayed in reports</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">Doctor name, specialization, and organization flow into generated reports automatically.</p>
        </div>
        <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-700">Header identity</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">The workspace header and patient-facing review screens use this same profile record.</p>
        </div>
        <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-700">Clinical ownership</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">Use this profile to keep case review ownership and sign-out context consistent.</p>
        </div>
      </div>

      {state.error ? (
        <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.success}</p>
      ) : null}

      <div className="mt-5">
        <SaveProfileButton />
      </div>
    </form>
  );
}
