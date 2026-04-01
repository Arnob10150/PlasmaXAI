"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

const registerSchema = z.object({
  fullName: z.string().min(3),
  organization: z.string().min(2),
  email: z.string().email(),
  specialization: z.string().min(2),
  password: z.string().min(8),
});

type RegisterValues = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const demoMode =
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (values: RegisterValues) => {
    if (demoMode) {
      document.cookie = `plasmaxai-demo-user=${encodeURIComponent(values.email)}; path=/; max-age=2592000; samesite=lax`;
      toast.success(`Welcome, ${values.fullName}.`);
      router.replace("/dashboard");
      router.refresh();
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          full_name: values.fullName,
          specialization: values.specialization,
          organization_name: values.organization,
        },
      },
    });

    setIsSubmitting(false);

    if (error) {
      setSubmitMessage(error.message);
      toast.error(error.message);
      return;
    }

    if (data.session) {
      toast.success("Account created. Welcome to PlasmaXAI.");
      router.replace("/dashboard");
      router.refresh();
      return;
    }

    const successMessage = "Account created. Check your email to verify your account, then sign in.";
    setSubmitMessage(successMessage);
    toast.success(successMessage);
    router.replace("/login");
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Full name</label>
          <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 transition focus-within:border-blue-400 focus-within:bg-white">
            <i className="bi bi-person-vcard-fill text-sm text-blue-700" aria-hidden="true" />
            <input {...register("fullName")} className="h-full w-full bg-transparent outline-none" />
          </div>
          {errors.fullName ? <p className="text-sm text-rose-600">{errors.fullName.message}</p> : null}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Specialization</label>
          <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 transition focus-within:border-blue-400 focus-within:bg-white">
            <i className="bi bi-heart-pulse-fill text-sm text-blue-700" aria-hidden="true" />
            <input {...register("specialization")} className="h-full w-full bg-transparent outline-none" />
          </div>
          {errors.specialization ? <p className="text-sm text-rose-600">{errors.specialization.message}</p> : null}
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">Hospital / organization</label>
        <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 transition focus-within:border-blue-400 focus-within:bg-white">
          <i className="bi bi-building-fill text-sm text-blue-700" aria-hidden="true" />
          <input {...register("organization")} className="h-full w-full bg-transparent outline-none" />
        </div>
        {errors.organization ? <p className="text-sm text-rose-600">{errors.organization.message}</p> : null}
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">Email</label>
        <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 transition focus-within:border-blue-400 focus-within:bg-white">
          <i className="bi bi-envelope-fill text-sm text-blue-700" aria-hidden="true" />
          <input {...register("email")} className="h-full w-full bg-transparent outline-none" />
        </div>
        {errors.email ? <p className="text-sm text-rose-600">{errors.email.message}</p> : null}
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">Password</label>
        <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 transition focus-within:border-blue-400 focus-within:bg-white">
          <i className="bi bi-shield-lock-fill text-sm text-blue-700" aria-hidden="true" />
          <input {...register("password")} type="password" className="h-full w-full bg-transparent outline-none" />
        </div>
        {errors.password ? <p className="text-sm text-rose-600">{errors.password.message}</p> : null}
      </div>
      {submitMessage ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {submitMessage}
        </div>
      ) : null}
      <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <input type="checkbox" className="mt-1 rounded border-slate-300" />
        I understand this website is a decision-support system and final diagnosis remains with the clinician.
      </label>
      <Button className="w-full" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating account..." : "Create doctor account"}
      </Button>
      <p className="text-center text-sm text-slate-500">
        Already have an account? {" "}
        <Link href="/login" className="font-medium text-blue-700">
          Sign in
        </Link>
      </p>
    </form>
  );
}
