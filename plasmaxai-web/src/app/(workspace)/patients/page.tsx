import Link from "next/link";
import { createPatientAction } from "@/app/(workspace)/patients/actions";
import { PatientCreateForm } from "@/components/patients/patient-create-form";
import { Badge } from "@/components/ui/badge";
import { formatCaseDate, getPatientsData } from "@/lib/supabase/workspace-data";

export default async function PatientsPage() {
  const patients = await getPatientsData();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.22em] text-blue-700">Patients</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Patient directory</h1>
        <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
          Group cases by patient so doctors can review disease progression and compare new analyses to prior history.
        </p>
      </div>

      <PatientCreateForm action={createPatientAction} />

      {patients.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {patients.map((patient) => (
            <div key={patient.id} className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-slate-500">Patient code</p>
                  <h2 className="mt-2 break-words text-2xl font-semibold text-slate-950">{patient.code}</h2>
                </div>
                <Badge variant="info">{patient.caseCount} cases</Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {patient.name ?? "Name not recorded yet"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                {patient.sex ? <span className="rounded-full bg-slate-100 px-3 py-1">{patient.sex}</span> : null}
                {patient.dateOfBirth ? <span className="rounded-full bg-slate-100 px-3 py-1">DOB {patient.dateOfBirth}</span> : null}
              </div>
              <div className="mt-4 rounded-[22px] bg-slate-50 p-4 text-sm text-slate-600">
                <p>
                  Latest case: <span className="font-medium text-slate-900">{patient.latestCaseCode}</span>
                </p>
                <p className="mt-2">Updated {formatCaseDate(patient.latestCaseAt)}</p>
              </div>
              <Link
                href={`/patients/${patient.id}`}
                className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-blue-700 transition hover:text-blue-800"
              >
                <i className="bi bi-pencil-square text-sm" aria-hidden="true" />
                Open patient profile
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[30px] border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
          <p className="text-lg font-semibold text-slate-950">No patients recorded yet</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Create a patient profile here or save a new case to start building the patient directory.
          </p>
          <Link href="/new-case" className="mt-5 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800">
            Create first case
          </Link>
        </div>
      )}
    </div>
  );
}
