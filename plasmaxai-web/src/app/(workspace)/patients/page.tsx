import Link from "next/link";
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
      {patients.length ? (
        <div className="grid gap-4 xl:grid-cols-3">
          {patients.map((patient) => (
            <div key={patient.id} className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-500">Patient code</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">{patient.code}</h2>
                </div>
                <Badge variant="info">{patient.caseCount} cases</Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {patient.name ?? "Name not recorded yet"}
              </p>
              <div className="mt-4 rounded-[22px] bg-slate-50 p-4 text-sm text-slate-600">
                <p>
                  Latest case: <span className="font-medium text-slate-900">{patient.latestCaseCode}</span>
                </p>
                <p className="mt-2">Updated {formatCaseDate(patient.latestCaseAt)}</p>
              </div>
              <Link href={`/patients/${patient.id}`} className="mt-5 inline-flex text-sm font-medium text-blue-700 transition hover:text-blue-800">
                Open patient profile
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[30px] border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
          <p className="text-lg font-semibold text-slate-950">No patients recorded yet</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Patient entries are created automatically the first time you save a new case.
          </p>
          <Link href="/new-case" className="mt-5 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800">
            Create first case
          </Link>
        </div>
      )}
    </div>
  );
}
