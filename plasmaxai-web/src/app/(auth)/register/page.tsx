import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return (
    <AuthShell
      title="Create your PlasmaXAI account"
      subtitle="Set up an individual doctor account for secure access to patient histories, case review, and downloadable reports."
    >
      <RegisterForm />
    </AuthShell>
  );
}

