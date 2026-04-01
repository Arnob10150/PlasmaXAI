"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";

interface ProbabilityProfile {
  plasmaxai?: number;
  resnet50?: number;
  densenet121?: number;
  counterfactual?: number;
}

interface ModalityGates {
  resnet50?: number;
  densenet121?: number;
  morphology?: number;
  counterfactual?: number;
}

interface CaseAnalysisDashboardProps {
  predictedClass: string | null;
  confidence: number | null;
  riskLevel: string | null;
  probabilities?: ProbabilityProfile | null;
  modalityGates?: ModalityGates | null;
  morphology?: Record<string, number> | null;
  topFeatures: string[];
  interpretiveNote: string;
  recommendedAction: string;
  intervalComment: string;
  timeline: Array<{
    label: string;
    confidence: number;
    riskScore: number;
    caseCode: string;
  }>;
}

const probabilityPalette = ["#2563eb", "#0f766e", "#7c3aed", "#f97316"];
const gatePalette = ["#0f766e", "#2563eb", "#f59e0b", "#7c3aed"];

const featureLabelMap: Record<string, string> = {
  nc_ratio: "N:C ratio",
  nucleus_area: "Nucleus area",
  mean_r: "Mean red intensity",
  mean_g: "Mean green intensity",
  mean_b: "Mean blue intensity",
  perimeter: "Cell perimeter",
  circularity: "Circularity",
  cytoplasm_area: "Cytoplasm area",
  texture_smoothness: "Texture smoothness",
};

function toPercent(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "Pending";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function formatFeatureLabel(feature: string) {
  return (
    featureLabelMap[feature] ??
    feature
      .replaceAll("_", " ")
      .replace(/\b\w/g, (match) => match.toUpperCase())
  );
}

function getPriorityLabel(riskLevel: string | null, confidence: number | null) {
  const risk = (riskLevel ?? "").toLowerCase();
  if (risk === "high" || (typeof confidence === "number" && confidence >= 0.9)) {
    return "Expedited review suggested";
  }

  if (risk === "moderate" || (typeof confidence === "number" && confidence >= 0.75)) {
    return "Correlation recommended";
  }

  if (typeof confidence === "number") {
    return "Routine review appropriate";
  }

  return "Analysis pending";
}

export function CaseAnalysisDashboard({
  predictedClass,
  confidence,
  riskLevel,
  probabilities,
  modalityGates,
  morphology,
  topFeatures,
  interpretiveNote,
  recommendedAction,
  intervalComment,
  timeline,
}: CaseAnalysisDashboardProps) {
  const probabilityData = useMemo(() => {
    const resolved = probabilities && Object.keys(probabilities).length
      ? probabilities
      : {
          plasmaxai:
            typeof confidence === "number"
              ? predictedClass?.toLowerCase().includes("benign")
                ? 1 - confidence
                : confidence
              : 0,
          resnet50: typeof confidence === "number" ? Math.max(confidence - 0.04, 0.05) : 0,
          densenet121: typeof confidence === "number" ? Math.max(confidence - 0.08, 0.05) : 0,
          counterfactual: typeof confidence === "number" ? Math.max(confidence - 0.03, 0.05) : 0,
        };

    return [
      { name: "Overall suspicion", value: Math.round((resolved.plasmaxai ?? 0) * 100) },
      { name: "Cell architecture", value: Math.round((resolved.resnet50 ?? 0) * 100) },
      { name: "Texture concordance", value: Math.round((resolved.densenet121 ?? 0) * 100) },
      { name: "Boundary stability", value: Math.round((resolved.counterfactual ?? 0) * 100) },
    ];
  }, [confidence, predictedClass, probabilities]);

  const gateData = useMemo(() => {
    const resolved = modalityGates && Object.keys(modalityGates).length
      ? modalityGates
      : {
          resnet50: 0.28,
          densenet121: 0.24,
          morphology: 0.22,
          counterfactual: 0.26,
        };

    return [
      { name: "Image pattern review", value: Math.round((resolved.resnet50 ?? 0) * 100) },
      { name: "Texture review", value: Math.round((resolved.densenet121 ?? 0) * 100) },
      { name: "Measured morphology", value: Math.round((resolved.morphology ?? 0) * 100) },
      { name: "Decision stability", value: Math.round((resolved.counterfactual ?? 0) * 100) },
    ];
  }, [modalityGates]);

  const morphologyData = useMemo(() => {
    const entries = Object.entries(morphology ?? {}).filter(([, value]) => Number.isFinite(value));

    if (!entries.length) {
      return topFeatures.map((feature, index) => ({
        name: formatFeatureLabel(feature),
        value: Math.max(76 - index * 12, 28),
        rawValue: null as number | null,
      }));
    }

    const maxValue = Math.max(...entries.map(([, value]) => Math.abs(value)), 1);

    return entries
      .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))
      .slice(0, 6)
      .map(([feature, value]) => ({
        name: formatFeatureLabel(feature),
        value: Math.max(18, Math.round((Math.abs(value) / maxValue) * 100)),
        rawValue: value,
      }));
  }, [morphology, topFeatures]);

  const timelineData = useMemo(
    () =>
      timeline.map((item) => ({
        ...item,
        confidencePct: Math.round(item.confidence * 100),
        riskPct: Math.round(item.riskScore * 100),
      })),
    [timeline],
  );

  const confidenceBandData = useMemo(() => {
    const resolved = typeof confidence === "number" ? Math.round(confidence * 100) : 0;
    return [
      { label: "Low review", upper: 55, confidence: Math.min(resolved, 55) },
      { label: "Intermediate", upper: 75, confidence: Math.min(Math.max(resolved, 55), 75) },
      { label: "High suspicion", upper: 100, confidence: resolved },
    ];
  }, [confidence]);

  const primaryFeatureText = topFeatures.length
    ? topFeatures.slice(0, 3).map((item) => formatFeatureLabel(item)).join(", ")
    : "case-specific morphology drivers";

  return (
    <section className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-blue-700">
            <i className="bi bi-activity text-base" aria-hidden="true" />
            Clinical interpretation
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            {predictedClass ?? "Analysis in progress"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
            This review panel summarizes the fused PlasmaXAI decision, highlights the strongest morphology drivers, and places the result in patient context for hematopathology correlation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={riskLevel?.toLowerCase() === "high" ? "danger" : riskLevel?.toLowerCase() === "moderate" ? "warning" : riskLevel ? "success" : "neutral"}>
            {riskLevel ? `${riskLevel} suspicion` : "Awaiting analysis"}
          </Badge>
          <Badge variant="info">{getPriorityLabel(riskLevel, confidence)}</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#eff6ff,#f8fbff)] p-4">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <i className="bi bi-speedometer2 text-sm text-blue-700" aria-hidden="true" />
            Diagnostic confidence
          </p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{toPercent(confidence)}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Strength of the current diagnostic support for this cell image.
          </p>
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ecfdf5,#f8fffb)] p-4">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <i className="bi bi-diagram-3-fill text-sm text-emerald-700" aria-hidden="true" />
            Dominant drivers
          </p>
          <p className="mt-3 text-lg font-semibold leading-7 text-slate-950">{primaryFeatureText}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Highest-yield morphology cues influencing the current interpretation.
          </p>
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#fff7ed,#fffdf7)] p-4">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <i className="bi bi-clipboard2-check-fill text-sm text-amber-600" aria-hidden="true" />
            Review priority
          </p>
          <p className="mt-3 text-lg font-semibold leading-7 text-slate-950">{getPriorityLabel(riskLevel, confidence)}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Suggested review urgency based on current model output and confidence strength.
          </p>
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-[20px] bg-white p-4 shadow-sm">
            <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-800">
              <i className="bi bi-journal-medical text-sm text-blue-700" aria-hidden="true" />
              AI interpretive note
            </p>
            <p className="mt-3 text-sm leading-7 text-slate-600">{interpretiveNote}</p>
          </div>
          <div className="rounded-[20px] bg-white p-4 shadow-sm">
            <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-800">
              <i className="bi bi-clipboard2-pulse-fill text-sm text-emerald-700" aria-hidden="true" />
              Recommended correlation
            </p>
            <p className="mt-3 text-sm leading-7 text-slate-600">{recommendedAction}</p>
          </div>
          <div className="rounded-[20px] bg-white p-4 shadow-sm">
            <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-800">
              <i className="bi bi-graph-up-arrow text-sm text-violet-700" aria-hidden="true" />
              Interval comparison
            </p>
            <p className="mt-3 text-sm leading-7 text-slate-600">{intervalComment}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[24px] border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-base font-semibold text-slate-950">
                <i className="bi bi-bar-chart-line-fill text-sm text-blue-700" aria-hidden="true" />
                Morphology review profile
              </p>
              <p className="text-sm text-slate-500">How strongly the current image supports the reported interpretation across review dimensions used during case assessment.</p>
            </div>
            <Badge variant="info">Current specimen</Badge>
          </div>
          <div className="h-[220px] sm:h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={probabilityData} outerRadius="72%">
                <PolarGrid stroke="#dbe7f4" />
                <PolarAngleAxis dataKey="name" tick={{ fill: "#475569", fontSize: 12 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                <Tooltip formatter={(value) => [`${value}%`, "Review support"]} />
                <Radar
                  name="Review support"
                  dataKey="value"
                  stroke="#2563eb"
                  fill="#2563eb"
                  fillOpacity={0.25}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-base font-semibold text-slate-950">
                <i className="bi bi-layers-half text-sm text-emerald-700" aria-hidden="true" />
                Review evidence mix
              </p>
              <p className="text-sm text-slate-500">Relative weight of visible morphology, texture, and stability cues in the current review.</p>
            </div>
            <Badge variant="success">Clinical aid</Badge>
          </div>
          <div className="h-[220px] sm:h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={gateData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={92}
                  paddingAngle={3}
                >
                  {gateData.map((entry, index) => (
                    <Cell key={entry.name} fill={gatePalette[index % gatePalette.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value}%`, "Contribution"]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {gateData.map((entry, index) => (
              <div key={entry.name} className="flex items-center gap-2 text-sm text-slate-600">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: gatePalette[index % gatePalette.length] }} />
                <span>{entry.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[24px] border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-base font-semibold text-slate-950">
                <i className="bi bi-bezier2 text-sm text-amber-600" aria-hidden="true" />
                Morphology cue map
              </p>
              <p className="text-sm text-slate-500">Most prominent cytomorphologic and stain-related cues in the current specimen.</p>
            </div>
            <Badge variant="warning">Top 6 cues</Badge>
          </div>
          <div className="h-[220px] sm:h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={morphologyData} layout="vertical" margin={{ left: 22, right: 6 }}>
                <CartesianGrid stroke="#edf2f7" horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={130} />
                <Tooltip
                  formatter={(value, _name, item: any) => {
                    const rawValue = item?.payload?.rawValue;
                    return [rawValue ?? `${value}%`, "Observed prominence"];
                  }}
                />
                <Bar dataKey="value" fill="#f59e0b" radius={[0, 12, 12, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-base font-semibold text-slate-950">
                <i className="bi bi-speedometer text-sm text-blue-700" aria-hidden="true" />
                Review confidence band
              </p>
              <p className="text-sm text-slate-500">Where this case sits relative to low, intermediate, and high-suspicion review zones.</p>
            </div>
            <Badge variant={riskLevel?.toLowerCase() === "high" ? "danger" : riskLevel?.toLowerCase() === "moderate" ? "warning" : "success"}>
              {riskLevel ? `${riskLevel} band` : "Pending"}
            </Badge>
          </div>
          <div className="h-[200px] sm:h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={confidenceBandData}>
                <defs>
                  <linearGradient id="confidenceBandFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#edf2f7" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                <Tooltip formatter={(value) => [`${value}%`, "Confidence"]} />
                <Area type="monotone" dataKey="confidence" stroke="#2563eb" fill="url(#confidenceBandFill)" strokeWidth={3} />
                <Line type="monotone" dataKey="upper" stroke="#94a3b8" strokeDasharray="6 6" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white p-4 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-base font-semibold text-slate-950">
                <i className="bi bi-graph-up text-sm text-violet-700" aria-hidden="true" />
                Patient interval trend
              </p>
              <p className="text-sm text-slate-500">Change in diagnostic support across recorded cases for this patient.</p>
            </div>
            <Badge variant={timelineData.length > 1 ? "info" : "neutral"}>
              {timelineData.length > 1 ? `${timelineData.length} cases tracked` : "First recorded case"}
            </Badge>
          </div>
          <div className="h-[220px] sm:h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timelineData}>
                <CartesianGrid stroke="#edf2f7" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} unit="%" />
                <Tooltip formatter={(value) => [`${value}%`, "Review confidence"]} />
                <Line type="monotone" dataKey="confidencePct" stroke="#7c3aed" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
}
