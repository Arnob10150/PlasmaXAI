import { NextRequest } from "next/server";

function getExternalInferenceUrl() {
  return (
    process.env.INFERENCE_API_URL?.trim() ||
    process.env.INFERENCE_URL?.trim() ||
    process.env.NEXT_PUBLIC_INFERENCE_URL?.trim() ||
    ""
  ).replace(/\/$/, "");
}

function buildTargetUrl(request: NextRequest, pathSegments: string[]) {
  const baseUrl = getExternalInferenceUrl();
  if (!baseUrl) {
    return null;
  }

  const target = new URL(`${baseUrl}/${pathSegments.join("/")}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value);
  });

  const sameOrigin =
    target.origin === request.nextUrl.origin &&
    target.pathname.startsWith("/api/inference");

  if (sameOrigin) {
    return null;
  }

  return target;
}

async function proxyRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const target = buildTargetUrl(request, path);

  if (!target) {
    return Response.json(
      {
        status: "unconfigured",
        message:
          "External inference service is not configured. Set INFERENCE_API_URL, INFERENCE_URL, or NEXT_PUBLIC_INFERENCE_URL.",
      },
      { status: 503 },
    );
  }

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  const response = await fetch(target, {
    method: request.method,
    headers,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer(),
    cache: "no-store",
    redirect: "follow",
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("transfer-encoding");
  responseHeaders.delete("connection");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context);
}
