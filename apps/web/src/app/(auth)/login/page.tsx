import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <AuthShell
      title="Sign in to your doctor workspace"
      subtitle="Access your saved patient cases, active reviews, and explainable PlasmaXAI reports."
    >
      <Suspense fallback={<div className="text-sm text-slate-500">Loading secure sign-in...</div>}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
