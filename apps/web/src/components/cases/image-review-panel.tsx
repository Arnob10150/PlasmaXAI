"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatClinicalFeatureLabel } from "@/lib/clinical-explainability";

interface ImageReviewPanelProps {
  imageUrl: string;
  imageName: string;
  heatmapUrl?: string | null;
  riskLevel?: string | null;
  topFeatures?: string[];
}

export function ImageReviewPanel({
  imageUrl,
  imageName,
  heatmapUrl = null,
  riskLevel,
  topFeatures = [],
}: ImageReviewPanelProps) {
  const [adaptiveOverlayUrl, setAdaptiveOverlayUrl] = useState<string | null>(null);
  const overlaySource = heatmapUrl ?? adaptiveOverlayUrl;
  const overlayAvailable = Boolean(overlaySource);
  const [showOverlay, setShowOverlay] = useState(Boolean(heatmapUrl));
  const [overlayOpacity, setOverlayOpacity] = useState(42);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;

    if (heatmapUrl) {
      setAdaptiveOverlayUrl(null);
      setShowOverlay(true);
      return () => {
        active = false;
      };
    }

    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.src = imageUrl;

    image.onload = () => {
      if (!active) {
        return;
      }

      const width = 224;
      const height = Math.max(1, Math.round((image.height / Math.max(image.width, 1)) * width));
      const baseCanvas = document.createElement("canvas");
      const overlayCanvas = document.createElement("canvas");
      baseCanvas.width = width;
      baseCanvas.height = height;
      overlayCanvas.width = width;
      overlayCanvas.height = height;

      const baseContext = baseCanvas.getContext("2d");
      const overlayContext = overlayCanvas.getContext("2d");

      if (!baseContext || !overlayContext) {
        setAdaptiveOverlayUrl(null);
        setShowOverlay(false);
        return;
      }

      baseContext.drawImage(image, 0, 0, width, height);
      const baseImage = baseContext.getImageData(0, 0, width, height);
      const output = overlayContext.createImageData(width, height);

      for (let index = 0; index < baseImage.data.length; index += 4) {
        const red = baseImage.data[index];
        const green = baseImage.data[index + 1];
        const blue = baseImage.data[index + 2];
        const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
        const chroma = Math.max(0, ((red + blue) / 2 - green) / 255);
        const density = Math.max(0, (190 - luminance) / 190);
        const intensity = Math.min(1, density * 0.72 + chroma * 0.58);

        output.data[index] = 255;
        output.data[index + 1] = Math.round(80 + intensity * 110);
        output.data[index + 2] = Math.round(140 + intensity * 90);
        output.data[index + 3] = Math.round(intensity * 170);
      }

      overlayContext.putImageData(output, 0, 0);
      const nextOverlay = overlayCanvas.toDataURL("image/png");
      setAdaptiveOverlayUrl(nextOverlay);
      setShowOverlay(true);
    };

    image.onerror = () => {
      if (!active) {
        return;
      }

      setAdaptiveOverlayUrl(null);
      setShowOverlay(false);
    };

    return () => {
      active = false;
    };
  }, [heatmapUrl, imageUrl]);

  const overlayLabel = useMemo(() => {
    if (heatmapUrl) {
      if (!topFeatures.length) {
        return "AI review focus map";
      }

      return `Focus cues: ${topFeatures.slice(0, 3).map((feature) => formatClinicalFeatureLabel(feature)).join(", ")}`;
    }

    if (adaptiveOverlayUrl) {
      return "Adaptive focus map";
    }

    if (!overlayAvailable) {
      return "No case-specific heatmap is attached yet";
    }
    return "Image overlay";
  }, [adaptiveOverlayUrl, heatmapUrl, overlayAvailable, topFeatures]);

  const filterStyle = {
    filter: `brightness(${brightness}%) contrast(${contrast}%)`,
  };

  const overlayBlendMode = heatmapUrl ? "screen" : "normal";

  const handleFullscreenToggle = async () => {
    if (!panelRef.current) {
      return;
    }

    if (!document.fullscreenElement) {
      await panelRef.current.requestFullscreen();
      setIsFullscreen(true);
      return;
    }

    await document.exitFullscreen();
    setIsFullscreen(false);
  };

  return (
    <div className="space-y-4" ref={panelRef}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <i className="bi bi-bounding-box-circles text-base text-blue-700" aria-hidden="true" />
            Microscopy image review
          </div>
          <p className="text-sm text-slate-500">Inspect morphology, adjust contrast, and review the case-specific focus map.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">Zoom + pan enabled</Badge>
          <Badge variant={overlayAvailable ? "success" : "neutral"}>
            {overlayAvailable ? "Focus map ready" : "Image only"}
          </Badge>
          <Badge variant={riskLevel?.toLowerCase() === "high" ? "danger" : riskLevel?.toLowerCase() === "moderate" ? "warning" : "neutral"}>
            {riskLevel ? `${riskLevel} risk` : "Awaiting inference"}
          </Badge>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-[24px] border border-slate-200 bg-slate-950 p-3 shadow-sm sm:p-4">
          <TransformWrapper centerOnInit initialScale={1} minScale={0.8} maxScale={6} wheel={{ step: 0.15 }}>
            {({ zoomIn, zoomOut, resetTransform, centerView }) => (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => zoomIn()}>
                      <i className="bi bi-zoom-in text-base" aria-hidden="true" />
                      Zoom in
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => zoomOut()}>
                      <i className="bi bi-zoom-out text-base" aria-hidden="true" />
                      Zoom out
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => { resetTransform(); centerView(); }}>
                      <i className="bi bi-arrow-counterclockwise text-base" aria-hidden="true" />
                      Reset
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant={showOverlay ? "primary" : "secondary"}
                      size="sm"
                      onClick={() => setShowOverlay((value) => !value)}
                      disabled={!overlayAvailable}
                    >
                      <i className="bi bi-layers-fill text-base" aria-hidden="true" />
                      {overlayAvailable ? (showOverlay ? "Overlay on" : "Overlay off") : "No overlay"}
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={handleFullscreenToggle}>
                      <i className={`bi ${isFullscreen ? "bi-fullscreen-exit" : "bi-fullscreen"} text-base`} aria-hidden="true" />
                      {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                    </Button>
                  </div>
                </div>

                <div className="overflow-hidden rounded-[24px] border border-white/10 bg-black/40">
                  <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full">
                    <div className="relative aspect-[4/3] min-h-[260px] w-full overflow-hidden bg-slate-950 sm:min-h-[340px] lg:min-h-[420px]">
                      <img
                        alt={imageName}
                        className="h-full w-full object-contain"
                        src={imageUrl}
                        style={filterStyle}
                      />
                      {showOverlay && overlaySource ? (
                        <motion.img
                          alt={`${imageName} attention heatmap`}
                          animate={{ opacity: overlayOpacity / 100 }}
                          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                          src={overlaySource}
                          style={{ mixBlendMode: overlayBlendMode, filter: heatmapUrl ? "saturate(1.2) contrast(1.1)" : "saturate(1.45) contrast(1.25)" }}
                        />
                      ) : null}
                      <div className="pointer-events-none absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] rounded-2xl border border-white/20 bg-slate-950/65 px-3 py-2 text-sm text-white backdrop-blur sm:bottom-4 sm:left-4 sm:max-w-[28rem] sm:px-4 sm:py-3">
                        <p className="font-medium">{overlayLabel}</p>
                        <p className="mt-1 text-xs text-slate-300">
                          {heatmapUrl
                            ? "This overlay is tied to the current case asset."
                            : adaptiveOverlayUrl
                              ? "This adaptive map is generated from the current image structure."
                              : "The original image is shown without a synthetic placeholder overlay."}
                        </p>
                        {showOverlay && overlaySource ? (
                          <p className="mt-2 text-xs text-slate-300">Heatmap opacity: {overlayOpacity}%</p>
                        ) : null}
                      </div>
                    </div>
                  </TransformComponent>
                </div>
              </>
            )}
          </TransformWrapper>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center gap-2 text-base font-semibold text-slate-950">
              <i className="bi bi-sliders text-base text-blue-700" aria-hidden="true" />
              Microscopy controls
            </div>
            <div className="mt-5 grid gap-5 text-sm text-slate-600 md:grid-cols-3">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="font-medium text-slate-700">Brightness</label>
                  <span>{brightness}%</span>
                </div>
                <input className="w-full" max={160} min={70} onChange={(event) => setBrightness(Number(event.target.value))} type="range" value={brightness} />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="font-medium text-slate-700">Contrast</label>
                  <span>{contrast}%</span>
                </div>
                <input className="w-full" max={170} min={70} onChange={(event) => setContrast(Number(event.target.value))} type="range" value={contrast} />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="font-medium text-slate-700">Overlay opacity</label>
                  <span>{overlayOpacity}%</span>
                </div>
                <input
                  className="w-full disabled:opacity-40"
                  disabled={!overlayAvailable}
                  max={100}
                  min={0}
                  onChange={(event) => setOverlayOpacity(Number(event.target.value))}
                  type="range"
                  value={overlayOpacity}
                />
              </div>
            </div>
            <div className="mt-5 rounded-[22px] bg-slate-50 p-4">
              <p className="font-medium text-slate-900">Overlay guide</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Warm regions highlight the parts of the cell receiving the strongest review emphasis. Use the overlay to support morphology review, not as a standalone diagnosis.
              </p>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <p className="font-medium text-slate-900">Top focus cues</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {topFeatures.length ? (
                  topFeatures.map((feature) => (
                    <span key={feature} className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
                      {formatClinicalFeatureLabel(feature)}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500">Case-specific cues appear after AI analysis completes.</span>
                )}
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center gap-2">
                <i className="bi bi-badge-ad text-sm text-blue-700" aria-hidden="true" />
                <p className="font-medium text-slate-900">Focus map preview</p>
              </div>
              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950/90">
                {overlaySource ? (
                  <img
                    alt="Focus map preview"
                    className="aspect-square w-full object-contain"
                    src={overlaySource}
                  />
                ) : (
                  <div className="flex aspect-square items-center justify-center px-4 text-center text-xs leading-5 text-slate-500">
                    The focus map appears as soon as the viewer derives one from the current image or a model heatmap is attached.
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
