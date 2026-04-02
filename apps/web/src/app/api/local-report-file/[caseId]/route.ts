import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";

function isHostedDeployment() {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  if (isHostedDeployment()) {
    return NextResponse.json({ error: "Local report route is unavailable in hosted deployments." }, { status: 404 });
  }

  const { ensureLocalCaseReport } = await import("@/lib/local-cases/store");
  const { caseId } = await params;
  const user = await getCurrentUser();
  const report = await ensureLocalCaseReport(caseId, {
    doctorName:
      user?.user_metadata?.full_name ??
      user?.user_metadata?.name ??
      user?.email?.split("@")[0] ??
      "Clinical reviewer",
    specialization: user?.user_metadata?.specialization ?? "Hematopathology",
  });

  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const file = await readFile(/*turbopackIgnore: true*/ report.storagePath);
  const fileName = `${caseId}-plasmaxai-report.pdf`;

  return new NextResponse(file, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
