"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { demoDoctors, getDemoDoctorByEmail } from "@/lib/demo/mock-data";

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your hospital or clinic email address.")
    .email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long.")
    .max(128, "Password is too long."),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const demoMode =
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const nextPath = searchParams.get("next") || "/dashboard";

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    watch,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: demoDoctors[0].email,
      password: "password123",
    },
  });
  const selectedDoctor = getDemoDoctorByEmail(watch("email"));

  const onSubmit = async (values: LoginValues) => {
    if (demoMode) {
      document.cookie = `plasmaxai-demo-user=${encodeURIComponent(values.email)}; path=/; max-age=2592000; samesite=lax`;
      toast.success(`Opening the workspace for ${getDemoDoctorByEmail(values.email).fullName}.`);
      router.replace(nextPath);
      router.refresh();
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });

    setIsSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      toast.error(error.message);
      return;
    }

    toast.success("Signed in successfully.");
    router.replace(nextPath);
    router.refresh();
  };

  const sendMagicLink = async () => {
    if (demoMode) {
      const email = getValues("email");
      document.cookie = `plasmaxai-demo-user=${encodeURIComponent(email)}; path=/; max-age=2592000; samesite=lax`;
      toast.success(`Opening the workspace for ${getDemoDoctorByEmail(email).fullName}.`);
      router.replace(nextPath);
      router.refresh();
      return;
    }

    const email = getValues("email");

    if (!email) {
      toast.error("Enter your email first to receive a magic link.");
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Magic link sent. Check your inbox.");
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
      {demoMode ? (
        <div className="rounded-2xl border border-blue-100 bg-blue-50/80 px-4 py-4 text-sm text-slate-700">
          <p className="font-medium text-slate-950">Local doctor accounts</p>
          <p className="mt-1 text-slate-600">Use any of these seeded accounts to open the workspace.</p>
          <div className="mt-3 grid gap-2">
            {demoDoctors.map((doctor) => (
              <button
                key={doctor.email}
                className="flex items-start justify-between rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-blue-200 hover:bg-blue-50"
                onClick={() => {
                  setValue("email", doctor.email, { shouldDirty: true, shouldTouch: true });
                }}
                type="button"
              >
                <span>
                  <span className="block font-medium text-slate-900">{doctor.fullName}</span>
                  <span className="block text-xs text-slate-500">{doctor.specialization}</span>
                </span>
                <span className="text-xs text-blue-700">{doctor.email}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">Email</label>
        <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 transition focus-within:border-blue-400 focus-within:bg-white">
          <i className="bi bi-envelope-fill text-sm text-blue-700" aria-hidden="true" />
          <input
            {...register("email")}
            aria-invalid={errors.email ? "true" : "false"}
            className="h-full w-full bg-transparent outline-none"
            placeholder="doctor@hospital.org"
          />
        </div>
        {errors.email ? <p className="text-sm text-rose-600">{errors.email.message}</p> : null}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-700">Password</label>
          <Link href="/register" className="text-sm font-medium text-blue-700">
            Need an account?
          </Link>
        </div>
        <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 transition focus-within:border-blue-400 focus-within:bg-white">
          <i className="bi bi-shield-lock-fill text-sm text-blue-700" aria-hidden="true" />
          <input
            {...register("password")}
            type="password"
            aria-invalid={errors.password ? "true" : "false"}
            className="h-full w-full bg-transparent outline-none"
            placeholder="Enter your password"
          />
        </div>
        {errors.password ? <p className="text-sm text-rose-600">{errors.password.message}</p> : null}
      </div>
      {submitError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {submitError}
        </div>
      ) : null}
      {demoMode ? (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Signing in as <span className="font-semibold">{selectedDoctor.fullName}</span> ({selectedDoctor.specialization})
        </div>
      ) : null}
      <div className="flex items-center justify-between text-sm text-slate-500">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="rounded border-slate-300" />
          Keep me signed in
        </label>
        <button type="button" className="font-medium text-blue-700">
          Forgot password?
        </button>
      </div>
      <Button className="w-full" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Signing in..." : "Sign in"}
      </Button>
      <Button className="w-full" type="button" variant="secondary" onClick={sendMagicLink}>
        <i className="bi bi-send-fill text-sm" aria-hidden="true" />
        Continue with magic link
      </Button>
      <Button className="w-full" href="/" type="button" variant="ghost">
        <i className="bi bi-arrow-left-circle text-sm" aria-hidden="true" />
        Return to home page
      </Button>
    </form>
  );
}
