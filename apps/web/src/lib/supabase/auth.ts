import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getLocalDoctorByEmail } from "@/lib/local-doctors/store";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

async function getDemoUser(): Promise<User> {
  const cookieStore = await cookies();
  const selectedEmail = cookieStore.get("plasmaxai-demo-user")?.value;
  const selectedDoctor = await getLocalDoctorByEmail(selectedEmail);

  return {
    id: selectedDoctor.id,
    app_metadata: {},
    user_metadata: {
      full_name: selectedDoctor.fullName,
      specialization: selectedDoctor.specialization,
      organization_name: selectedDoctor.organizationName,
    },
    aud: "authenticated",
    created_at: new Date().toISOString(),
    email: selectedDoctor.email,
  } as User;
}

export const getCurrentUser = cache(async () => {
  if (!hasSupabaseConfig()) {
    return getDemoUser();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
});

async function ensureDoctorProfile(user: User) {
  if (!hasSupabaseConfig()) {
    return;
  }

  const supabase = await createClient();
  const fullName = user.user_metadata?.full_name ?? user.user_metadata?.name ?? null;
  const specialization = user.user_metadata?.specialization ?? null;
  const organizationName = user.user_metadata?.organization_name ?? null;

  const { data: profile, error: profileReadError } = await supabase
    .from("profiles")
    .select("id, organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileReadError) {
    return;
  }

  await supabase.from("profiles").upsert(
    {
      id: user.id,
      full_name: fullName,
      specialization,
      organization_name: organizationName,
    },
    { onConflict: "id" },
  );

  if (profile?.organization_id || !organizationName) {
    return;
  }

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .insert({
      name: organizationName,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (organizationError || !organization) {
    return;
  }

  await supabase
    .from("profiles")
    .update({ organization_id: organization.id })
    .eq("id", user.id);
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  await ensureDoctorProfile(user);

  return user;
}
