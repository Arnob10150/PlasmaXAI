"use client";

import { useMemo, useState, type ReactNode } from "react";

interface ReportDownloadButtonProps {
  caseId: string;
  href: string;
  imageUrl?: string | null;
  className?: string;
  children: ReactNode;
  pendingLabel?: string;
}

function parseFileName(contentDisposition: string | null, fallback: string) {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  return fallback;
}

export function ReportDownloadButton({
  caseId,
  href,
  imageUrl,
  className,
  children,
  pendingLabel = "Preparing report...",
}: ReportDownloadButtonProps) {
  const [isPending, setIsPending] = useState(false);
  const browserStorageKey = useMemo(() => {
    if (!imageUrl?.startsWith("browser-storage://")) {
      return null;
    }

    return `plasmaxai-upload:${imageUrl.replace("browser-storage://", "")}`;
  }, [imageUrl]);

  const canClientEmbedImage = Boolean(browserStorageKey && href.includes("/api/local-report-file/"));

  async function handleClick() {
    if (!canClientEmbedImage || !browserStorageKey) {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }

    setIsPending(true);

    try {
      const raw = window.localStorage.getItem(browserStorageKey);
      const parsed = raw ? (JSON.parse(raw) as { dataUrl?: string }) : null;

      const response = await fetch(href, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageDataUrl: parsed?.dataUrl ?? null,
        }),
      });

      if (!response.ok) {
        throw new Error(`Report request failed with ${response.status}.`);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = parseFileName(
        response.headers.get("content-disposition"),
        `${caseId}-plasmaxai-report.pdf`,
      );
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch {
      window.open(href, "_blank", "noopener,noreferrer");
    } finally {
      setIsPending(false);
    }
  }

  if (!canClientEmbedImage) {
    return (
      <a className={className} href={href} rel="noreferrer" target="_blank">
        {children}
      </a>
    );
  }

  return (
    <button className={className} onClick={() => void handleClick()} type="button">
      {isPending ? pendingLabel : children}
    </button>
  );
}
