import { DoctorProfileForm } from "@/components/profile/doctor-profile-form";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/supabase/auth";
import { updateProfileAction } from "@/app/(workspace)/profile/actions";

export default async function ProfilePage() {
  const user = await requireUser();
  const fullName =
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    user.email?.split("@")[0] ??
    "Doctor";
  const specialization = user.user_metadata?.specialization ?? "Clinical reviewer";
  const organizationName = user.user_metadata?.organization_name ?? "PlasmaXAI Clinical Lab";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.22em] text-blue-700">
            <i className="bi bi-person-badge-fill text-base" aria-hidden="true" />
            Profile
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Doctor account</h1>
          <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
            Maintain the clinical identity used in the workspace header, saved reports, and case-review documentation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="info">{specialization}</Badge>
          <Badge variant="neutral">{organizationName}</Badge>
        </div>
      </div>

      <DoctorProfileForm
        action={updateProfileAction}
        doctor={{
          fullName,
          specialization,
          organizationName,
        }}
      />
    </div>
  );
}
