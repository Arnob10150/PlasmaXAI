import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { ensureLocalCaseReport } from "@/lib/local-cases/store";
import { getCurrentUser } from "@/lib/supabase/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
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
