import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getLocalCase } from "@/lib/local-cases/store";

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
