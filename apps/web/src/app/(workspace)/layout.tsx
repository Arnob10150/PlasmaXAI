import type { User } from "@supabase/supabase-js";
import { requireUser } from "@/lib/supabase/auth";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

function getDoctorName(user: User) {
  const metadata = user.user_metadata;

  return metadata?.full_name ?? metadata?.name ?? user.email?.split("@")[0] ?? "Doctor";
}

export default async function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();

  return (
    <WorkspaceShell
      demoMode={!hasSupabaseConfig()}
      doctorName={getDoctorName(user)}
      specialization={user.user_metadata?.specialization ?? "Clinical reviewer"}
    >
      {children}
    </WorkspaceShell>
  );
}
