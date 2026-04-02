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
  fullName: z
    .string()
    .trim()
    .min(3, "Enter your full name.")
    .regex(/^[A-Za-z][A-Za-z .'-]*$/, "Use alphabetic characters as they appear on your clinical ID."),
  organization: z
    .string()
    .trim()
    .min(2, "Enter your hospital, laboratory, or organization name."),
  email: z
    .string()
    .trim()
    .min(1, "Enter your work email address.")
    .email("Enter a valid email address."),
  specialization: z
    .string()
    .trim()
    .min(2, "Enter your medical specialization."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long.")
    .regex(/[A-Z]/, "Password must include at least one uppercase letter.")
    .regex(/[a-z]/, "Password must include at least one lowercase letter.")
    .regex(/[0-9]/, "Password must include at least one number."),
  confirmPassword: z.string().min(1, "Confirm your password."),
  acceptsClinicalUseNotice: z
    .boolean()
    .refine((value) => value, "You must acknowledge that PlasmaXAI is a decision-support system."),
}).refine((values) => values.password === values.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
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
            <input
              {...register("fullName")}
              aria-invalid={errors.fullName ? "true" : "false"}
              className="h-full w-full bg-transparent outline-none"
              placeholder="Dr. Arnob Aich Anurag"
            />
          </div>
          {errors.fullName ? <p className="text-sm text-rose-600">{errors.fullName.message}</p> : null}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Specialization</label>
          <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 transition focus-within:border-blue-400 focus-within:bg-white">
            <i className="bi bi-heart-pulse-fill text-sm text-blue-700" aria-hidden="true" />
            <input
              {...register("specialization")}
              aria-invalid={errors.specialization ? "true" : "false"}
              className="h-full w-full bg-transparent outline-none"
              placeholder="Hematopathology"
            />
          </div>
          {errors.specialization ? <p className="text-sm text-rose-600">{errors.specialization.message}</p> : null}
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">Hospital / organization</label>
        <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 transition focus-within:border-blue-400 focus-within:bg-white">
          <i className="bi bi-building-fill text-sm text-blue-700" aria-hidden="true" />
          <input
            {...register("organization")}
            aria-invalid={errors.organization ? "true" : "false"}
            className="h-full w-full bg-transparent outline-none"
            placeholder="BUET Clinical Research Unit"
          />
        </div>
        {errors.organization ? <p className="text-sm text-rose-600">{errors.organization.message}</p> : null}
      </div>
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
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Password</label>
          <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 transition focus-within:border-blue-400 focus-within:bg-white">
            <i className="bi bi-shield-lock-fill text-sm text-blue-700" aria-hidden="true" />
            <input
              {...register("password")}
              type="password"
              aria-invalid={errors.password ? "true" : "false"}
              className="h-full w-full bg-transparent outline-none"
              placeholder="Create a strong password"
            />
          </div>
          {errors.password ? <p className="text-sm text-rose-600">{errors.password.message}</p> : null}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Confirm password</label>
          <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 transition focus-within:border-blue-400 focus-within:bg-white">
            <i className="bi bi-shield-check text-sm text-blue-700" aria-hidden="true" />
            <input
              {...register("confirmPassword")}
              type="password"
              aria-invalid={errors.confirmPassword ? "true" : "false"}
              className="h-full w-full bg-transparent outline-none"
              placeholder="Re-enter your password"
            />
          </div>
          {errors.confirmPassword ? <p className="text-sm text-rose-600">{errors.confirmPassword.message}</p> : null}
        </div>
      </div>
      {submitMessage ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {submitMessage}
        </div>
      ) : null}
      <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <input
          {...register("acceptsClinicalUseNotice")}
          type="checkbox"
          aria-invalid={errors.acceptsClinicalUseNotice ? "true" : "false"}
          className="mt-1 rounded border-slate-300"
        />
        I understand this website is a decision-support system and final diagnosis remains with the clinician.
      </label>
      {errors.acceptsClinicalUseNotice ? (
        <p className="text-sm text-rose-600">{errors.acceptsClinicalUseNotice.message}</p>
      ) : null}
      <Button className="w-full" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating account..." : "Create doctor account"}
      </Button>
      <Button className="w-full" href="/" type="button" variant="ghost">
        <i className="bi bi-arrow-left-circle text-sm" aria-hidden="true" />
        Return to home page
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
