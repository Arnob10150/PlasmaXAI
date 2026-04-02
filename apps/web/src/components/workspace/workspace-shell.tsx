"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LogoLockup } from "@/components/shared/logo-lockup";

const navigation = [
  { href: "/dashboard", label: "Dashboard", iconClass: "bi bi-grid-1x2-fill" },
  { href: "/new-case", label: "New case", iconClass: "bi bi-file-earmark-medical-fill" },
  { href: "/history", label: "History", iconClass: "bi bi-clock-history" },
  { href: "/patients", label: "Patients", iconClass: "bi bi-people-fill" },
  { href: "/profile", label: "Profile", iconClass: "bi bi-person-badge-fill" },
  { href: "/settings", label: "Settings", iconClass: "bi bi-gear-fill" },
];

interface WorkspaceShellProps {
  children: React.ReactNode;
  doctorName: string;
  specialization: string;
  demoMode?: boolean;
}

export function WorkspaceShell({
  children,
  doctorName,
  specialization,
  demoMode = false,
}: WorkspaceShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (demoMode) {
      toast.success("Signed out successfully.");
      router.replace("/login");
      router.refresh();
      return;
    }

    setIsSigningOut(true);

    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();

    setIsSigningOut(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Signed out successfully.");
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="dashboard-grid min-h-screen bg-[var(--bg)]">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/94 backdrop-blur">
        <div className="flex w-full items-center justify-between gap-3 px-3 py-3 sm:px-4 lg:px-6">
            <div className="flex items-center gap-4">
              <LogoLockup />
              <div className="hidden min-w-0 md:block">
                <p className="text-sm font-semibold text-slate-950">Hematology review workspace</p>
                <p className="text-xs text-slate-500">Case review, explainability, and reporting</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="hidden items-center gap-2 text-sm text-slate-600 lg:flex">
                <i className="bi bi-person-badge-fill text-base text-blue-700" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="max-w-[160px] truncate font-medium text-slate-900">{doctorName}</p>
                  <p className="truncate text-xs text-slate-500">{specialization}</p>
                </div>
              </div>
            </div>
        </div>
        <nav className="border-t border-slate-200/80 bg-white/92 px-3 py-2 lg:hidden">
          <div className="scrollbar-soft flex gap-2 overflow-x-auto pb-1">
            {navigation.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm",
                    active
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
                  )}
                >
                  <i className={cn(item.iconClass, "text-sm")} aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      <div className="flex w-full gap-4 py-3">
        <aside className="sticky top-[88px] hidden h-[calc(100vh-96px)] w-[292px] shrink-0 self-start overflow-hidden rounded-r-[28px] border-y border-r border-white/70 bg-white/84 p-4 shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur lg:flex">
          <div className="flex h-full flex-col">
            <div className="rounded-[24px] border border-slate-200 bg-slate-950 p-3.5 text-white">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-blue-200">Review queue</p>
                  <h2 className="mt-1.5 text-base font-semibold">Today&apos;s clinical focus</h2>
                </div>
                <div className="rounded-2xl bg-white/10 p-2.5 text-blue-100">
                  <i className="bi bi-clipboard2-pulse-fill text-base" aria-hidden="true" />
                </div>
              </div>
              <p className="mt-2.5 text-xs leading-5 text-slate-300">
                Keep urgent reviews, case history, and sign-out tasks within immediate reach.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-blue-100">Reviewed cases</span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-blue-100">Reports ready</span>
              </div>
            </div>

            <nav className="mt-4 flex flex-col gap-1.5">
              {navigation.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm",
                      active
                        ? "bg-[linear-gradient(135deg,#eff6ff,#eefaf7)] text-slate-950 shadow-sm"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
                    )}
                  >
                    <i
                      className={cn(
                        item.iconClass,
                        "text-base",
                        active ? "text-blue-700" : "text-slate-400",
                      )}
                      aria-hidden="true"
                    />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-white p-3 text-slate-800 shadow-sm">
                  <i className="bi bi-person-circle text-lg" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">Doctor account</p>
                  <p className="mt-1 truncate text-sm font-medium text-slate-700">{doctorName}</p>
                  <p className="mt-1 text-sm text-slate-500">{specialization}</p>
                </div>
              </div>
              <button
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:text-slate-950 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSigningOut}
                onClick={handleSignOut}
                type="button"
              >
                <i className="bi bi-box-arrow-right text-base" aria-hidden="true" />
                {isSigningOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1 px-3 sm:px-4 lg:pr-6">
          <motion.main
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="min-w-0 overflow-hidden rounded-[26px] border border-white/70 bg-white/84 p-4 shadow-[0_28px_80px_rgba(15,23,42,0.06)] backdrop-blur sm:p-5 lg:rounded-[32px] lg:p-6"
          >
            <div className="scrollbar-soft min-w-0 overflow-auto">{children}</div>
          </motion.main>
        </div>
      </div>
    </div>
  );
}
