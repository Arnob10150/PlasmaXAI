import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function isHostedDeployment() {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
}

function resolveDiskPath(storagePath: string) {
  if (path.isAbsolute(storagePath)) {
    return storagePath;
  }

  return path.join(/*turbopackIgnore: true*/ process.cwd(), "public", storagePath.replace(/^\/+/, ""));
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  if (isHostedDeployment()) {
    return NextResponse.json({ error: "Local file route is unavailable in hosted deployments." }, { status: 404 });
  }

  const { getLocalCase } = await import("@/lib/local-cases/store");
  const { caseId } = await context.params;
  const caseItem = await getLocalCase(caseId);
  const image = caseItem?.images[0];

  if (!image) {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }

  try {
    const bytes = await readFile(resolveDiskPath(image.storagePath));
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": image.mimeType ?? "application/octet-stream",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Unable to read image." }, { status: 404 });
  }
}
