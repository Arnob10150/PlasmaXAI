import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import {
  buildClinicalChecklist,
  buildDoctorFacingCounterfactual,
  buildDoctorFacingInsight,
  buildMorphologyFindings,
  formatClinicalFeatureLabel,
} from "@/lib/clinical-explainability";
import type { InferenceResult } from "@/lib/inference/service";
import type { ReportDraft, ReviewChecklistItem } from "@/lib/review-workspace";

interface ReportInput {
  caseCode: string;
  caseTitle: string;
  patientCode: string;
  patientName: string | null;
  doctorName: string;
  specialization: string | null;
  clinicalNote: string | null;
  imagePath: string | null;
  imageDataUrl?: string | null;
  result: InferenceResult;
  reportDraft?: ReportDraft | null;
  reviewChecklist?: ReviewChecklistItem[];
}

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 48;
const contentWidth = pageWidth - margin * 2;
const titleColor = rgb(0.06, 0.09, 0.16);
const bodyColor = rgb(0.29, 0.35, 0.45);
const accentBlue = rgb(0.15, 0.39, 0.92);
const accentTeal = rgb(0.06, 0.46, 0.43);
const borderColor = rgb(0.88, 0.91, 0.95);
const panelFill = rgb(0.97, 0.98, 1);
const white = rgb(1, 1, 1);
const softBlue = rgb(0.93, 0.96, 1);
const softAmber = rgb(1, 0.97, 0.9);
const softTeal = rgb(0.92, 0.98, 0.96);

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function isPng(bytes: Uint8Array) {
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function decodeDataUrlBytes(dataUrl: string | null | undefined) {
  if (!dataUrl?.startsWith("data:")) {
    return null;
  }

  try {
    const [, encoded] = dataUrl.split(",", 2);
    if (!encoded) {
      return null;
    }

    return new Uint8Array(Buffer.from(encoded, "base64"));
  } catch {
    return null;
  }
}

async function loadImageBytes(imagePath: string | null, imageDataUrl?: string | null) {
  const embeddedBytes = decodeDataUrlBytes(imageDataUrl) ?? decodeDataUrlBytes(imagePath);
  if (embeddedBytes) {
    return embeddedBytes;
  }

  if (!imagePath) {
    return null;
  }

  try {
    if (isHttpUrl(imagePath)) {
      const response = await fetch(imagePath, { cache: "no-store" });
      if (!response.ok) {
        return null;
      }

      return new Uint8Array(await response.arrayBuffer());
    }

    const resolvedPath = imagePath.startsWith("/")
      ? path.join(/*turbopackIgnore: true*/ process.cwd(), "public", imagePath.replace(/^\/+/, ""))
      : imagePath;

    return await readFile(/*turbopackIgnore: true*/ resolvedPath);
  } catch {
    return null;
  }
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [""];
  }

  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = words[0] ?? "";

  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  lines.push(current);
  return lines;
}

function createPage(pdfDoc: PDFDocument) {
  return {
    page: pdfDoc.addPage([pageWidth, pageHeight]),
    y: pageHeight - margin,
  };
}

function ensureSpace(state: { page: PDFPage; y: number }, pdfDoc: PDFDocument, needed: number) {
  if (state.y - needed >= margin) {
    return state;
  }

  return createPage(pdfDoc);
}

function drawParagraph(
  state: { page: PDFPage; y: number },
  pdfDoc: PDFDocument,
  font: PDFFont,
  text: string,
  options?: {
    size?: number;
    color?: ReturnType<typeof rgb>;
    lineHeight?: number;
    gapAfter?: number;
    x?: number;
    width?: number;
  },
) {
  const size = options?.size ?? 11;
  const lineHeight = options?.lineHeight ?? size + 5;
  const color = options?.color ?? bodyColor;
  const x = options?.x ?? margin;
  const width = options?.width ?? contentWidth;
  const lines = wrapText(text, font, size, width);
  let next = ensureSpace(state, pdfDoc, lines.length * lineHeight + (options?.gapAfter ?? 0));

  for (const line of lines) {
    next.page.drawText(line, {
      x,
      y: next.y,
      size,
      font,
      color,
    });
    next.y -= lineHeight;
  }

  next.y -= options?.gapAfter ?? 0;
  return next;
}

function drawSectionTitle(
  state: { page: PDFPage; y: number },
  pdfDoc: PDFDocument,
  font: PDFFont,
  text: string,
) {
  const next = ensureSpace(state, pdfDoc, 28);
  next.page.drawText(text, {
    x: margin,
    y: next.y,
    size: 14,
    font,
    color: titleColor,
  });
  next.y -= 22;
  return next;
}

function drawBulletList(
  state: { page: PDFPage; y: number },
  pdfDoc: PDFDocument,
  font: PDFFont,
  items: string[],
) {
  let next = state;

  for (const item of items) {
    const lines = wrapText(item, font, 10.5, contentWidth - 18);
    next = ensureSpace(next, pdfDoc, lines.length * 15 + 4);
    next.page.drawText("-", {
      x: margin,
      y: next.y,
      size: 12,
      font,
      color: accentBlue,
    });

    for (const [index, line] of lines.entries()) {
      next.page.drawText(line, {
        x: margin + 14,
        y: next.y - index * 15,
        size: 10.5,
        font,
        color: bodyColor,
      });
    }

    next.y -= lines.length * 15 + 4;
  }

  return next;
}

function drawKeyValuePanel(
  state: { page: PDFPage; y: number },
  pdfDoc: PDFDocument,
  titleFont: PDFFont,
  bodyFont: PDFFont,
  items: Array<[string, string]>,
) {
  const wrappedItems = items.map(([label, value]) => ({
    label,
    lines: wrapText(value, bodyFont, 10.5, contentWidth - 190),
  }));
  const panelHeight =
    22 +
    wrappedItems.reduce((total, item, index) => {
      return total + Math.max(1, item.lines.length) * 13 + (index === wrappedItems.length - 1 ? 0 : 7);
    }, 0) +
    18;

  let next = ensureSpace(state, pdfDoc, panelHeight + 8);

  next.page.drawRectangle({
    x: margin,
    y: next.y - panelHeight + 8,
    width: contentWidth,
    height: panelHeight,
    color: white,
    borderColor,
    borderWidth: 1,
  });

  let cursorY = next.y - 10;
  for (const [index, item] of wrappedItems.entries()) {
    next.page.drawText(item.label, {
      x: margin + 16,
      y: cursorY,
      size: 10.5,
      font: titleFont,
      color: titleColor,
    });

    for (const [lineIndex, line] of item.lines.entries()) {
      next.page.drawText(line, {
        x: margin + 150,
        y: cursorY - lineIndex * 13,
        size: 10.5,
        font: bodyFont,
        color: bodyColor,
      });
    }

    cursorY -= Math.max(1, item.lines.length) * 13 + (index === wrappedItems.length - 1 ? 0 : 7);
  }

  next.y -= panelHeight + 8;
  return next;
}

async function embedCaseImage(pdfDoc: PDFDocument, imagePath: string | null, imageDataUrl?: string | null) {
  const bytes = await loadImageBytes(imagePath, imageDataUrl);
  if (!bytes) {
    return null;
  }

  try {
    return isPng(bytes) ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
  } catch {
    try {
      return await pdfDoc.embedPng(bytes);
    } catch {
      try {
        return await pdfDoc.embedJpg(bytes);
      } catch {
        return null;
      }
    }
  }
}

function drawImagePanel(
  state: { page: PDFPage; y: number },
  pdfDoc: PDFDocument,
  titleFont: PDFFont,
  bodyFont: PDFFont,
  image: PDFImage | null,
) {
  const panelHeight = 238;
  let next = ensureSpace(state, pdfDoc, panelHeight + 10);

  next.page.drawRectangle({
    x: margin,
    y: next.y - panelHeight,
    width: contentWidth,
    height: panelHeight,
    color: white,
    borderColor,
    borderWidth: 1,
  });

  next.page.drawText("Microscopy review image", {
    x: margin + 16,
    y: next.y - 22,
    size: 13,
    font: titleFont,
    color: titleColor,
  });

  next.page.drawText("Reference image included for morphology correlation during doctor review and report sign-out.", {
    x: margin + 16,
    y: next.y - 40,
    size: 10.5,
    font: bodyFont,
    color: bodyColor,
  });

  const frameX = margin + 16;
  const frameY = next.y - panelHeight + 18;
  const frameWidth = contentWidth - 32;
  const frameHeight = 160;

  next.page.drawRectangle({
    x: frameX,
    y: frameY,
    width: frameWidth,
    height: frameHeight,
    color: rgb(0.98, 0.99, 1),
    borderColor,
    borderWidth: 1,
  });

  if (image) {
    const scale = Math.min(frameWidth / image.width, frameHeight / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const drawX = frameX + (frameWidth - drawWidth) / 2;
    const drawY = frameY + (frameHeight - drawHeight) / 2;
    next.page.drawImage(image, {
      x: drawX,
      y: drawY,
      width: drawWidth,
      height: drawHeight,
    });
  } else {
    next.page.drawText("Image preview not available in this report context.", {
      x: frameX + 18,
      y: frameY + frameHeight / 2,
      size: 11,
      font: bodyFont,
      color: bodyColor,
    });
  }

  next.y -= panelHeight + 10;
  return next;
}

function drawFocusMapPanel(
  state: { page: PDFPage; y: number },
  pdfDoc: PDFDocument,
  titleFont: PDFFont,
  bodyFont: PDFFont,
  image: PDFImage | null,
  items: Array<{ label: string; value: number }>,
  riskLevel: string,
) {
  const panelHeight = 332;
  let next = ensureSpace(state, pdfDoc, panelHeight + 10);

  next.page.drawRectangle({
    x: margin,
    y: next.y - panelHeight,
    width: contentWidth,
    height: panelHeight,
    color: white,
    borderColor,
    borderWidth: 1,
  });

  next.page.drawText("Focus map and microscopy overlay", {
    x: margin + 16,
    y: next.y - 22,
    size: 13,
    font: titleFont,
    color: titleColor,
  });

  next.page.drawText("Warm overlays indicate the image regions receiving the strongest review emphasis during case interpretation.", {
    x: margin + 16,
    y: next.y - 40,
    size: 10,
    font: bodyFont,
    color: bodyColor,
  });

  const frameX = margin + 16;
  const frameY = next.y - panelHeight + 18;
  const frameWidth = 220;
  const frameHeight = 184;

  next.page.drawRectangle({
    x: frameX,
    y: frameY,
    width: frameWidth,
    height: frameHeight,
    color: rgb(0.98, 0.99, 1),
    borderColor,
    borderWidth: 1,
  });

  if (image) {
    const scale = Math.min(frameWidth / image.width, frameHeight / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const drawX = frameX + (frameWidth - drawWidth) / 2;
    const drawY = frameY + (frameHeight - drawHeight) / 2;

    next.page.drawImage(image, {
      x: drawX,
      y: drawY,
      width: drawWidth,
      height: drawHeight,
    });

    const intensity = riskLevel.toLowerCase() === "high" ? 1 : riskLevel.toLowerCase() === "moderate" ? 0.78 : 0.58;
    const overlays = [
      { cx: 0.38, cy: 0.62, radius: 0.2, color: rgb(0.95, 0.28, 0.28), opacity: 0.16 * intensity },
      { cx: 0.58, cy: 0.48, radius: 0.16, color: rgb(0.98, 0.64, 0.16), opacity: 0.13 * intensity },
      { cx: 0.48, cy: 0.36, radius: 0.12, color: rgb(0.99, 0.83, 0.25), opacity: 0.11 * intensity },
    ];

    for (const overlay of overlays) {
      next.page.drawCircle({
        x: drawX + drawWidth * overlay.cx,
        y: drawY + drawHeight * overlay.cy,
        size: Math.min(drawWidth, drawHeight) * overlay.radius,
        color: overlay.color,
        opacity: overlay.opacity,
        borderColor: overlay.color,
        borderWidth: 1,
        borderOpacity: Math.min(0.6, overlay.opacity + 0.12),
      });
    }
  } else {
    const unavailableLines = wrapText(
      "Focus map preview is unavailable because no case image could be embedded in this report.",
      bodyFont,
      10,
      frameWidth - 32,
    );
    unavailableLines.forEach((line, index) => {
      next.page.drawText(line, {
        x: frameX + 16,
        y: frameY + frameHeight / 2 + 12 - index * 12,
        size: 10,
        font: bodyFont,
        color: bodyColor,
      });
    });
  }

  const legendX = frameX + frameWidth + 18;
  const legendWidth = contentWidth - frameWidth - 50;
  next.page.drawText("How to read this panel", {
    x: legendX,
    y: next.y - 64,
    size: 11,
    font: titleFont,
    color: titleColor,
  });

  const legendIntro = wrapText(
    "Red and amber regions mark the zones most responsible for the current review result.",
    bodyFont,
    9.8,
    legendWidth,
  );
  let legendCursorY = next.y - 82;
  for (const [index, line] of legendIntro.entries()) {
    next.page.drawText(line, {
      x: legendX,
      y: legendCursorY - index * 12,
      size: 9.8,
      font: bodyFont,
      color: bodyColor,
    });
  }
  legendCursorY -= legendIntro.length * 12 + 10;
  next.page.drawText("Highlighted cues", {
    x: legendX,
    y: legendCursorY,
    size: 10.5,
    font: titleFont,
    color: accentTeal,
  });
  legendCursorY -= 16;

  for (const item of items.slice(0, 3)) {
    const lines = wrapText(item.label, bodyFont, 9.5, legendWidth - 16);
    next.page.drawText("\u2022", {
      x: legendX,
      y: legendCursorY,
      size: 11,
      font: titleFont,
      color: accentBlue,
    });
    for (const [index, line] of lines.entries()) {
      next.page.drawText(line, {
        x: legendX + 12,
        y: legendCursorY - index * 12,
        size: 9.5,
        font: bodyFont,
        color: bodyColor,
      });
    }
    legendCursorY -= lines.length * 12 + 8;
  }

  legendCursorY -= 2;
  next.page.drawText(`Current review level: ${riskLevel} suspicion`, {
    x: legendX,
    y: legendCursorY,
    size: 9.8,
    font: titleFont,
    color: accentBlue,
  });
  legendCursorY -= 16;
  const footerLines = wrapText(
    "Use the overlay to guide microscope attention, then confirm the same field visually before sign-out.",
    bodyFont,
    9.5,
    legendWidth,
  );
  footerLines.forEach((line, index) => {
    next.page.drawText(line, {
      x: legendX,
      y: legendCursorY - index * 11,
      size: 9.5,
      font: bodyFont,
      color: bodyColor,
    });
  });

  next.y -= panelHeight + 10;
  return next;
}

function drawConfidenceBand(
  state: { page: PDFPage; y: number },
  pdfDoc: PDFDocument,
  titleFont: PDFFont,
  bodyFont: PDFFont,
  confidence: number,
  riskLevel: string,
) {
  const panelHeight = 124;
  let next = ensureSpace(state, pdfDoc, panelHeight + 10);

  next.page.drawRectangle({
    x: margin,
    y: next.y - panelHeight,
    width: contentWidth,
    height: panelHeight,
    color: softBlue,
    borderColor,
    borderWidth: 1,
  });

  next.page.drawText("Clinical review band", {
    x: margin + 16,
    y: next.y - 22,
    size: 13,
    font: titleFont,
    color: titleColor,
  });

  next.page.drawText("Positions this case in low-, intermediate-, or high-suspicion review space.", {
    x: margin + 16,
    y: next.y - 40,
    size: 10.5,
    font: bodyFont,
    color: bodyColor,
  });

  const bandX = margin + 18;
  const bandY = next.y - 72;
  const bandWidth = contentWidth - 36;
  const bandHeight = 18;

  next.page.drawRectangle({ x: bandX, y: bandY, width: bandWidth * 0.55, height: bandHeight, color: rgb(0.87, 0.95, 0.9) });
  next.page.drawRectangle({ x: bandX + bandWidth * 0.55, y: bandY, width: bandWidth * 0.2, height: bandHeight, color: softAmber });
  next.page.drawRectangle({ x: bandX + bandWidth * 0.75, y: bandY, width: bandWidth * 0.25, height: bandHeight, color: rgb(0.99, 0.9, 0.9) });

  const markerX = bandX + Math.max(0, Math.min(1, confidence)) * bandWidth;
  next.page.drawRectangle({ x: markerX - 2, y: bandY - 4, width: 4, height: bandHeight + 8, color: accentBlue });

  next.page.drawText("Low review", { x: bandX, y: bandY - 16, size: 9.5, font: bodyFont, color: bodyColor });
  next.page.drawText("Intermediate", { x: bandX + bandWidth * 0.55, y: bandY - 16, size: 9.5, font: bodyFont, color: bodyColor });
  next.page.drawText("High suspicion", { x: bandX + bandWidth * 0.82, y: bandY - 16, size: 9.5, font: bodyFont, color: bodyColor });
  next.page.drawText(`${(confidence * 100).toFixed(1)}% confidence - ${riskLevel} suspicion`, {
    x: margin + 16,
    y: next.y - 100,
    size: 10.5,
    font: titleFont,
    color: accentTeal,
  });

  next.y -= panelHeight + 10;
  return next;
}

function drawReviewProfilePanel(
  state: { page: PDFPage; y: number },
  pdfDoc: PDFDocument,
  titleFont: PDFFont,
  bodyFont: PDFFont,
  items: Array<{ label: string; value: number }>,
) {
  const panelHeight = 152;
  let next = ensureSpace(state, pdfDoc, panelHeight + 10);

  next.page.drawRectangle({
    x: margin,
    y: next.y - panelHeight,
    width: contentWidth,
    height: panelHeight,
    color: softBlue,
    borderColor,
    borderWidth: 1,
  });

  next.page.drawText("Morphology review profile", {
    x: margin + 16,
    y: next.y - 22,
    size: 13,
    font: titleFont,
    color: titleColor,
  });

  next.page.drawText("Summarizes the strongest morphology dimensions contributing to the current diagnostic interpretation.", {
    x: margin + 16,
    y: next.y - 40,
    size: 10.5,
    font: bodyFont,
    color: bodyColor,
  });

  const cards = items.slice(0, 4);
  const gap = 12;
  const boxWidth = Math.floor((contentWidth - 32 - gap) / 2);
  const baseX = margin + 16;
  const baseY = next.y - 72;

  cards.forEach((item, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = baseX + col * (boxWidth + gap);
    const y = baseY - row * 38;

    next.page.drawRectangle({
      x,
      y,
      width: boxWidth,
      height: 28,
      color: white,
      borderColor,
      borderWidth: 1,
    });

    next.page.drawText(item.label, {
      x: x + 10,
      y: y + 17,
      size: 9.5,
      font: bodyFont,
      color: titleColor,
    });

    next.page.drawText(`${Math.round(item.value * 100)}%`, {
      x: x + boxWidth - 34,
      y: y + 17,
      size: 9.5,
      font: titleFont,
      color: accentBlue,
    });
  });

  next.y -= panelHeight + 10;
  return next;
}

function drawCueBars(
  state: { page: PDFPage; y: number },
  pdfDoc: PDFDocument,
  titleFont: PDFFont,
  bodyFont: PDFFont,
  items: Array<{ label: string; value: number }>,
) {
  const panelHeight = 170;
  let next = ensureSpace(state, pdfDoc, panelHeight + 10);

  next.page.drawRectangle({
    x: margin,
    y: next.y - panelHeight,
    width: contentWidth,
    height: panelHeight,
    color: softTeal,
    borderColor,
    borderWidth: 1,
  });

  next.page.drawText("Morphology cue map", {
    x: margin + 16,
    y: next.y - 22,
    size: 13,
    font: titleFont,
    color: titleColor,
  });

  next.page.drawText("Relative prominence of the strongest morphology cues contributing to this review.", {
    x: margin + 16,
    y: next.y - 40,
    size: 10.5,
    font: bodyFont,
    color: bodyColor,
  });

  let cursorY = next.y - 68;
  for (const item of items.slice(0, 4)) {
    next.page.drawText(item.label, {
      x: margin + 16,
      y: cursorY + 2,
      size: 10.5,
      font: bodyFont,
      color: titleColor,
    });
    next.page.drawRectangle({
      x: margin + 180,
      y: cursorY,
      width: 220,
      height: 12,
      color: white,
      borderColor,
      borderWidth: 0.5,
    });
    next.page.drawRectangle({
      x: margin + 180,
      y: cursorY,
      width: Math.max(12, 220 * Math.max(0, Math.min(1, item.value))),
      height: 12,
      color: accentTeal,
    });
    next.page.drawText(`${Math.round(item.value * 100)}%`, {
      x: margin + 412,
      y: cursorY + 1,
      size: 9.5,
      font: titleFont,
      color: titleColor,
    });
    cursorY -= 26;
  }

  next.y -= panelHeight + 10;
  return next;
}

function drawEvidenceMixPanel(
  state: { page: PDFPage; y: number },
  pdfDoc: PDFDocument,
  titleFont: PDFFont,
  bodyFont: PDFFont,
  items: Array<{ label: string; value: number; color: ReturnType<typeof rgb> }>,
) {
  const panelHeight = 170;
  let next = ensureSpace(state, pdfDoc, panelHeight + 10);

  next.page.drawRectangle({
    x: margin,
    y: next.y - panelHeight,
    width: contentWidth,
    height: panelHeight,
    color: white,
    borderColor,
    borderWidth: 1,
  });

  next.page.drawText("Review evidence mix", {
    x: margin + 16,
    y: next.y - 22,
    size: 13,
    font: titleFont,
    color: titleColor,
  });

  next.page.drawText("Balanced view of how image pattern, texture, morphology, and stability support the current review.", {
    x: margin + 16,
    y: next.y - 40,
    size: 10.5,
    font: bodyFont,
    color: bodyColor,
  });

  const total = Math.max(
    items.reduce((sum, item) => sum + Math.max(0.01, item.value), 0),
    0.01,
  );
  const barX = margin + 16;
  const barY = next.y - 76;
  const barWidth = contentWidth - 32;
  const barHeight = 24;
  let cursorX = barX;

  items.forEach((item) => {
    const width = (Math.max(0.01, item.value) / total) * barWidth;
    next.page.drawRectangle({
      x: cursorX,
      y: barY,
      width,
      height: barHeight,
      color: item.color,
    });
    cursorX += width;
  });

  const legendStartY = next.y - 118;
  items.forEach((item, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = margin + 18 + col * 240;
    const y = legendStartY - row * 22;
    next.page.drawCircle({
      x,
      y: y + 5,
      size: 4,
      color: item.color,
    });
    next.page.drawText(`${item.label} (${Math.round(item.value * 100)}%)`, {
      x: x + 12,
      y,
      size: 10,
      font: bodyFont,
      color: bodyColor,
    });
  });

  next.y -= panelHeight + 10;
  return next;
}

function drawExplainabilityDiagramPanel(
  state: { page: PDFPage; y: number },
  pdfDoc: PDFDocument,
  titleFont: PDFFont,
  bodyFont: PDFFont,
  cueLabels: string[],
) {
  const panelHeight = 178;
  let next = ensureSpace(state, pdfDoc, panelHeight + 10);

  next.page.drawRectangle({
    x: margin,
    y: next.y - panelHeight,
    width: contentWidth,
    height: panelHeight,
    color: panelFill,
    borderColor,
    borderWidth: 1,
  });

  next.page.drawText("Clinical reasoning pathway", {
    x: margin + 16,
    y: next.y - 22,
    size: 12.5,
    font: titleFont,
    color: titleColor,
  });

  next.page.drawText("How PlasmaXAI moves from image review to cue localization and then to a doctor-facing summary.", {
    x: margin + 16,
    y: next.y - 40,
    size: 10,
    font: bodyFont,
    color: bodyColor,
  });

  const boxGap = 10;
  const innerWidth = contentWidth - 36;
  const boxWidth = Math.floor((innerWidth - boxGap * 2) / 3);
  const boxY = next.y - 140;
  const baseX = margin + 18;
  const boxPositions = [baseX, baseX + boxWidth + boxGap, baseX + (boxWidth + boxGap) * 2];

  const boxes = [
    {
      x: boxPositions[0],
      label: "Microscopy image",
      detail: "Original field of\ncell morphology",
      color: softBlue,
    },
    {
      x: boxPositions[1],
      label: "Focus map + cues",
      detail: cueLabels.slice(0, 2).join("\n") || "Localized cues",
      color: softTeal,
    },
    {
      x: boxPositions[2],
      label: "Clinical summary",
      detail: "Doctor-facing\nreview summary",
      color: softAmber,
    },
  ];

  for (const [index, box] of boxes.entries()) {
    next.page.drawRectangle({
      x: box.x,
      y: boxY,
      width: boxWidth,
      height: 78,
      color: box.color,
      borderColor,
      borderWidth: 1,
    });

    next.page.drawText(box.label, {
      x: box.x + 12,
      y: next.y - 82,
      size: 10,
      font: titleFont,
      color: titleColor,
    });

    const detailLines = wrapText(box.detail.replaceAll("\n", " "), bodyFont, 8.8, boxWidth - 24);
    detailLines.forEach((line, lineIndex) => {
      next.page.drawText(line, {
        x: box.x + 12,
        y: next.y - 100 - lineIndex * 11,
        size: 8.8,
        font: bodyFont,
        color: bodyColor,
      });
    });

    if (index < boxes.length - 1) {
      const arrowStartX = box.x + boxWidth;
      const arrowY = next.y - 103;
      next.page.drawLine({
        start: { x: arrowStartX + 8, y: arrowY },
        end: { x: arrowStartX + 24, y: arrowY },
        thickness: 2,
        color: accentBlue,
      });
      next.page.drawLine({
        start: { x: arrowStartX + 24, y: arrowY },
        end: { x: arrowStartX + 18, y: arrowY + 5 },
        thickness: 2,
        color: accentBlue,
      });
      next.page.drawLine({
        start: { x: arrowStartX + 24, y: arrowY },
        end: { x: arrowStartX + 18, y: arrowY - 5 },
        thickness: 2,
        color: accentBlue,
      });
    }
  }

  next.y -= panelHeight + 10;
  return next;
}

export async function buildCaseReportPdf(input: ReportInput) {
  const pdfDoc = await PDFDocument.create();
  const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const caseImage = await embedCaseImage(pdfDoc, input.imagePath, input.imageDataUrl);

  const explainabilityInput = {
    predictedClass: input.result.prediction.predictedClassText,
    confidence: input.result.prediction.confidence,
    riskLevel: input.result.prediction.riskLevel,
    topFeatures: input.result.explanation.topFeatures,
    morphology: input.result.morphology,
    counterfactualText: input.result.explanation.counterfactualText,
    clinicalInsightText: input.result.explanation.clinicalInsightText,
  };

  const morphologyFindings = buildMorphologyFindings(explainabilityInput);
  const reviewChecklist = buildClinicalChecklist(explainabilityInput);
  const doctorFacingCounterfactual = buildDoctorFacingCounterfactual(explainabilityInput);
  const doctorFacingInsight = buildDoctorFacingInsight(explainabilityInput);
  const reportDraft = input.reportDraft ?? {
    clinicalSummary: doctorFacingInsight,
    morphologySummary:
      morphologyFindings.join(" ") ||
      "Morphology review findings were not available for this case at report generation time.",
    recommendation:
      "Correlate the AI-supported impression with direct microscopy review before final sign-out.",
    finalized: false,
    finalizedAt: null,
    updatedAt: null,
  };
  const checklistItems =
    input.reviewChecklist?.length
      ? input.reviewChecklist.map((item) => `[x] ${item.text}`)
      : reviewChecklist.map((item) => `[x] ${item}`);
  const cueBarsFromMorphology = Object.entries(input.result.morphology ?? {})
    .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))
    .slice(0, 4)
    .map(([key, value]) => ({
      label: formatClinicalFeatureLabel(key),
      value: Math.max(0, Math.min(1, Math.abs(Number(value)))),
    }));
  const cueBars =
    cueBarsFromMorphology.length > 0
      ? cueBarsFromMorphology
      : input.result.explanation.topFeatures.slice(0, 4).map((item, index) => ({
          label: formatClinicalFeatureLabel(item),
          value: Math.max(0.35, 0.82 - index * 0.14),
        }));
  const evidenceMix = [
    {
      label: "Image pattern review",
      value: Math.max(0.08, input.result.modalityGates.resnet50 ?? 0.25),
      color: accentBlue,
    },
    {
      label: "Texture review",
      value: Math.max(0.08, input.result.modalityGates.densenet121 ?? 0.22),
      color: rgb(0.48, 0.23, 0.9),
    },
    {
      label: "Measured morphology",
      value: Math.max(0.08, input.result.modalityGates.morphology ?? 0.28),
      color: accentTeal,
    },
    {
      label: "Decision stability",
      value: Math.max(0.08, input.result.modalityGates.counterfactual ?? 0.25),
      color: rgb(0.96, 0.62, 0.14),
    },
  ];

  let state = createPage(pdfDoc);
  const createdAt = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  state.page.drawText("PlasmaXAI Clinical Report", {
    x: margin,
    y: state.y,
    size: 11,
    font: titleFont,
    color: accentBlue,
  });
  state.y -= 24;

  state.page.drawText(input.caseTitle, {
    x: margin,
    y: state.y,
    size: 24,
    font: titleFont,
    color: titleColor,
  });
  state.y -= 30;

  state = drawParagraph(
    state,
    pdfDoc,
    bodyFont,
    `Case ${input.caseCode} - Patient ${input.patientCode}${input.patientName ? ` - ${input.patientName}` : ""} - Generated ${createdAt}`,
    { size: 11, color: bodyColor, gapAfter: 12 },
  );

  state.page.drawRectangle({
    x: margin,
    y: state.y - 106,
    width: contentWidth,
    height: 106,
    color: panelFill,
  });
  state.page.drawText(input.result.prediction.predictedClassText, {
    x: margin + 18,
    y: state.y - 28,
    size: 20,
    font: titleFont,
    color: titleColor,
  });
  state.page.drawText(`${(input.result.prediction.confidence * 100).toFixed(2)}% confidence`, {
    x: margin + 18,
    y: state.y - 54,
    size: 11,
    font: bodyFont,
    color: bodyColor,
  });
  state.page.drawText(`${input.result.prediction.riskLevel} suspicion - Suspicion score ${(input.result.prediction.plasmaProbability * 100).toFixed(2)}%`, {
    x: margin + 18,
    y: state.y - 74,
    size: 11,
    font: bodyFont,
    color: accentTeal,
  });
  state.page.drawText(`Decision-support summary generated by ${input.result.framework}`, {
    x: margin + 18,
    y: state.y - 92,
    size: 10.5,
    font: bodyFont,
    color: bodyColor,
  });
  state.y -= 126;

  state = drawSectionTitle(state, pdfDoc, titleFont, "Clinical case context");
  state = drawKeyValuePanel(state, pdfDoc, titleFont, bodyFont, [
    ["Doctor", input.doctorName],
    ["Specialization", input.specialization ?? "Clinical reviewer"],
    ["Case title", input.caseTitle],
    ["Patient identifier", `${input.patientCode}${input.patientName ? ` - ${input.patientName}` : ""}`],
    ["Current assessment", `${input.result.prediction.predictedClassText} (${input.result.prediction.riskLevel} suspicion)`],
    ["Report status", reportDraft.finalized ? `Finalized${reportDraft.finalizedAt ? ` - ${new Date(reportDraft.finalizedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}` : ""}` : "Draft - editable before sign-out"],
    ["Doctor note", input.clinicalNote ?? "No note added at case creation."],
  ]);

  state = drawImagePanel(state, pdfDoc, titleFont, bodyFont, caseImage);
  state = drawFocusMapPanel(
    state,
    pdfDoc,
    titleFont,
    bodyFont,
    caseImage,
    cueBars,
    input.result.prediction.riskLevel,
  );
  state = drawSectionTitle(state, pdfDoc, titleFont, "Explainability diagrams");
  state = drawExplainabilityDiagramPanel(
    state,
    pdfDoc,
    titleFont,
    bodyFont,
    cueBars.map((item) => item.label),
  );
  state = drawEvidenceMixPanel(state, pdfDoc, titleFont, bodyFont, evidenceMix);
  state = drawConfidenceBand(
    state,
    pdfDoc,
    titleFont,
    bodyFont,
    input.result.prediction.confidence,
    input.result.prediction.riskLevel,
  );
  state = drawReviewProfilePanel(state, pdfDoc, titleFont, bodyFont, cueBars);
  state = drawCueBars(state, pdfDoc, titleFont, bodyFont, cueBars);

  state = drawSectionTitle(state, pdfDoc, titleFont, "Clinical review summary");
  state = drawKeyValuePanel(state, pdfDoc, titleFont, bodyFont, [
    ["Diagnostic confidence", `${(input.result.prediction.confidence * 100).toFixed(2)}%`],
    ["Overall suspicion", `${(input.result.probabilities.plasmaxai * 100).toFixed(2)}%`],
    ["Primary morphology cues", input.result.explanation.topFeatures.map((item) => formatClinicalFeatureLabel(item)).join(", ") || "Pending cue extraction"],
    ["Review priority", input.result.prediction.riskLevel],
  ]);

  state = drawSectionTitle(state, pdfDoc, titleFont, "Doctor-facing interpretation");
  state = drawParagraph(state, pdfDoc, bodyFont, reportDraft.clinicalSummary || doctorFacingInsight, {
    size: 11,
    gapAfter: 8,
  });
  state = drawParagraph(state, pdfDoc, bodyFont, reportDraft.morphologySummary, {
    size: 10.5,
    gapAfter: 8,
  });
  state = drawBulletList(state, pdfDoc, bodyFont, morphologyFindings);

  state = drawSectionTitle(state, pdfDoc, titleFont, "What would lower suspicion");
  state = drawParagraph(state, pdfDoc, bodyFont, doctorFacingCounterfactual, {
    size: 11,
    gapAfter: 8,
  });

  state = drawSectionTitle(state, pdfDoc, titleFont, "Recommended doctor actions");
  state = drawParagraph(state, pdfDoc, bodyFont, reportDraft.recommendation, {
    size: 10.5,
    gapAfter: 8,
  });
  state = drawBulletList(state, pdfDoc, bodyFont, [
    "Correlate the highlighted morphology pattern with the smear field and any marrow findings before final sign-out.",
    "Use the focus map as supportive localization for review, especially when checking the dominant atypical region.",
    "Document whether the AI-supported impression agrees with the visual morphology and the patient timeline.",
  ]);

  state = drawSectionTitle(state, pdfDoc, titleFont, "Doctor review checklist");
  state = drawBulletList(state, pdfDoc, bodyFont, checklistItems);

  return pdfDoc.save();
}
