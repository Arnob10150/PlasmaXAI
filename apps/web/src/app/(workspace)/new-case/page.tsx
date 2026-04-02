import { NewCaseForm } from "@/components/cases/new-case-form";
import { createCaseAction } from "@/app/(workspace)/new-case/actions";

export default function NewCasePage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.22em] text-blue-700">New analysis</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Create a new plasma-cell case</h1>
        <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
          Add patient context, record the image reference, and open a persistent PlasmaXAI review workspace for this doctor account.
        </p>
      </div>

      <NewCaseForm action={createCaseAction} />
    </div>
  );
}
