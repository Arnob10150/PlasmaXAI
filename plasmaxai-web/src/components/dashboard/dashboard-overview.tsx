"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MotionDiv } from "@/components/motion/motion-div";
import { Badge } from "@/components/ui/badge";

type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

interface CaseSummary {
  id: string;
  caseCode: string;
  status: string;
  patient: {
    code: string;
  } | null;
  prediction: {
    confidence: number;
    riskLevel: string;
  } | null;
}

const iconClassMap: Record<string, string> = {
  ClipboardList: "bi bi-clipboard2-pulse-fill",
  AlertTriangle: "bi bi-exclamation-diamond-fill",
  Brain: "bi bi-cpu-fill",
  Clock3: "bi bi-hourglass-split",
};

interface DashboardOverviewProps {
  data: {
    summary: Array<{
      title: string;
      value: string;
      delta: string;
      tone: string;
      icon: string;
    }>;
    activityTrend: Array<{
      day: string;
      cases: number;
      confidence: number;
    }>;
    recentCases: CaseSummary[];
    hasCases: boolean;
  };
}

function getStatusTone(status: string): BadgeTone {
  switch (status) {
    case "reviewed":
      return "success";
    case "report_ready":
      return "info";
    case "needs_second_review":
    case "follow_up_required":
      return "warning";
    default:
      return "neutral";
  }
}

function getRiskTone(riskLevel?: string | null): BadgeTone {
  switch ((riskLevel ?? "").toLowerCase()) {
    case "high":
      return "danger";
    case "moderate":
      return "warning";
    case "low":
      return "success";
    default:
      return "neutral";
  }
}

function formatConfidence(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "Awaiting inference";
  }

  return `${(value * 100).toFixed(2)}%`;
}

export function DashboardOverview({ data }: DashboardOverviewProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const totalActivity = useMemo(
    () => data.activityTrend.reduce((sum, item) => sum + item.cases, 0),
    [data.activityTrend],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.22em] text-blue-700">
            <i className="bi bi-grid-1x2-fill text-base" aria-hidden="true" />
            Dashboard
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Doctor review workspace</h1>
          <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
            Track active cases, inspect patient trends, and jump into PlasmaXAI review sessions from one clinical dashboard.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="success">Auth connected</Badge>
          <Badge variant={data.hasCases ? "info" : "neutral"}>
            {data.hasCases ? `${data.recentCases.length} recent cases loaded` : "No cases yet"}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.summary.map((item, index) => {
          const iconClass = iconClassMap[item.icon] ?? "bi bi-clipboard2-pulse-fill";
          return (
            <MotionDiv
              key={item.title}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: index * 0.06 }}
              className={`rounded-[28px] border border-slate-200 bg-gradient-to-br ${item.tone} p-5 shadow-[0_18px_36px_rgba(15,23,42,0.04)]`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">{item.title}</p>
                  <p className="mt-3 text-3xl font-semibold text-slate-950">{item.value}</p>
                </div>
                <div className="rounded-2xl bg-white/80 p-3 text-slate-800 shadow-sm">
                  <i className={`${iconClass} text-lg`} aria-hidden="true" />
                </div>
              </div>
              <p className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-600">
                <i className="bi bi-arrow-up-right-circle-fill text-base text-emerald-600" aria-hidden="true" />
                {item.delta}
              </p>
            </MotionDiv>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                <i className="bi bi-graph-up-arrow text-base text-blue-700" aria-hidden="true" />
                Weekly case activity
              </div>
              <p className="text-sm text-slate-500">Cases created and mean confidence over the last seven days</p>
            </div>
            <Badge variant="info">{totalActivity} cases this week</Badge>
          </div>
          <div className="h-[220px] sm:h-[280px]">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.activityTrend}>
                  <defs>
                    <linearGradient id="confidenceFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.36} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e5edf6" vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="confidence" stroke="#2563eb" strokeWidth={3} fill="url(#confidenceFill)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full animate-pulse rounded-[24px] bg-slate-100" />
            )}
          </div>
        </div>

        <div className="rounded-[30px] border border-slate-200 bg-slate-950 p-5 text-white shadow-[0_20px_50px_rgba(15,23,42,0.14)]">
          <div className="mb-5">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <i className="bi bi-bar-chart-line-fill text-base text-cyan-300" aria-hidden="true" />
              Case throughput
            </div>
            <p className="text-sm text-slate-300">Daily created cases across the last seven days</p>
          </div>
          <div className="h-[220px] sm:h-[280px]">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.activityTrend}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: "#cbd5e1" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#cbd5e1" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="cases" fill="url(#barGradient)" radius={[10, 10, 0, 0]} />
                  <defs>
                    <linearGradient id="barGradient" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" />
                      <stop offset="100%" stopColor="#0f766e" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full animate-pulse rounded-[24px] bg-white/8" />
            )}
          </div>
        </div>
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold text-slate-950">
              <i className="bi bi-collection-fill text-base text-blue-700" aria-hidden="true" />
              Recent cases
            </div>
            <p className="text-sm text-slate-500">Quick access to saved reviews for the current doctor account</p>
          </div>
          <Badge variant="neutral">Auto-saved history</Badge>
        </div>
        {data.recentCases.length ? (
          <div className="overflow-x-auto rounded-[24px] border border-slate-200">
            <table className="min-w-[720px] w-full border-collapse text-left">
              <thead className="bg-slate-50 text-sm text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Case ID</th>
                  <th className="px-4 py-3 font-medium">Patient</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Risk</th>
                  <th className="px-4 py-3 font-medium">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {data.recentCases.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 text-sm text-slate-700">
                    <td className="px-4 py-4 font-semibold text-slate-950">
                      <Link href={`/cases/${row.id}`} className="inline-flex items-center gap-2 transition hover:text-blue-700">
                        <i className="bi bi-box-arrow-up-right text-sm text-blue-700" aria-hidden="true" />
                        {row.caseCode}
                      </Link>
                    </td>
                    <td className="px-4 py-4">{row.patient?.code ?? "Unassigned"}</td>
                    <td className="px-4 py-4">
                      <Badge variant={getStatusTone(row.status)}>{row.status.replaceAll("_", " ")}</Badge>
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant={getRiskTone(row.prediction?.riskLevel)}>
                        {row.prediction?.riskLevel ?? "Pending"}
                      </Badge>
                    </td>
                    <td className="px-4 py-4">{formatConfidence(row.prediction?.confidence)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
            <p className="text-lg font-semibold text-slate-950">No cases saved yet</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Create your first PlasmaXAI case to start building patient history and doctor review workflows.
            </p>
            <Link href="/new-case" className="mt-5 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800">
              Create first case
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
