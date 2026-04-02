import type { InferenceResult } from "@/lib/inference/service";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildCaseReportHtml(input: {
  caseCode: string;
  caseTitle: string;
  patientCode: string;
  patientName: string | null;
  doctorName: string;
  specialization: string | null;
  clinicalNote: string | null;
  imagePath: string | null;
  result: InferenceResult;
}) {
  const prediction = input.result.prediction;
  const explanation = input.result.explanation;
  const probabilities = input.result.probabilities;
  const gates = input.result.modalityGates;
  const morphology = input.result.morphology;
  const createdAt = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const topFeatures = explanation.topFeatures
    .map((feature) => `<li>${escapeHtml(feature)}</li>`)
    .join("");

  const morphologyRows = Object.entries(morphology)
    .map(
      ([key, value]) => `
        <tr>
          <td>${escapeHtml(key)}</td>
          <td>${Number(value).toFixed(4)}</td>
        </tr>
      `,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PlasmaXAI Report - ${escapeHtml(input.caseCode)}</title>
    <style>
      body {
        font-family: Arial, Helvetica, sans-serif;
        background: #f8fafc;
        color: #0f172a;
        margin: 0;
        padding: 32px;
      }
      .sheet {
        background: white;
        max-width: 980px;
        margin: 0 auto;
        border-radius: 24px;
        padding: 32px;
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
      }
      h1, h2, h3, p {
        margin-top: 0;
      }
      .eyebrow {
        color: #2563eb;
        font-size: 12px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        font-weight: 700;
      }
      .hero {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        align-items: flex-start;
      }
      .hero-card {
        min-width: 240px;
        background: linear-gradient(135deg, #eff6ff, #ecfeff);
        padding: 20px;
        border-radius: 20px;
      }
      .grid {
        display: grid;
        gap: 20px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-top: 24px;
      }
      .card {
        border: 1px solid #e2e8f0;
        border-radius: 20px;
        padding: 20px;
        background: #fff;
      }
      .full {
        grid-column: 1 / -1;
      }
      .badge {
        display: inline-block;
        padding: 8px 12px;
        border-radius: 999px;
        background: #fee2e2;
        color: #b91c1c;
        font-weight: 700;
        font-size: 12px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 12px;
      }
      th, td {
        border-bottom: 1px solid #e2e8f0;
        padding: 10px 0;
        text-align: left;
        font-size: 14px;
      }
      .muted {
        color: #475569;
      }
      ul {
        margin: 12px 0 0;
        padding-left: 18px;
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <p class="eyebrow">PlasmaXAI clinical report</p>
      <div class="hero">
        <div>
          <h1>${escapeHtml(input.caseTitle)}</h1>
          <p class="muted">Case ${escapeHtml(input.caseCode)} · Patient ${escapeHtml(input.patientCode)}${input.patientName ? ` · ${escapeHtml(input.patientName)}` : ""}</p>
          <p class="muted">Generated ${createdAt}</p>
        </div>
        <div class="hero-card">
          <p class="muted">Prediction summary</p>
          <h2>${escapeHtml(prediction.predictedClassText)}</h2>
          <p><span class="badge">${escapeHtml(prediction.riskLevel)} risk</span></p>
          <p class="muted">Confidence ${(prediction.confidence * 100).toFixed(2)}%</p>
          <p class="muted">Plasma probability ${(prediction.plasmaProbability * 100).toFixed(2)}%</p>
        </div>
      </div>

      <div class="grid">
        <section class="card">
          <h3>Doctor and case context</h3>
          <p><strong>Doctor:</strong> ${escapeHtml(input.doctorName)}</p>
          <p><strong>Specialization:</strong> ${escapeHtml(input.specialization ?? "Clinical reviewer")}</p>
          <p><strong>Framework:</strong> ${escapeHtml(input.result.framework)} (${escapeHtml(input.result.modelVersion)})</p>
        </section>

        <section class="card">
          <h3>Probability breakdown</h3>
          <p><strong>PlasmaXAI:</strong> ${(probabilities.plasmaxai * 100).toFixed(2)}%</p>
          <p><strong>ResNet50:</strong> ${(probabilities.resnet50 * 100).toFixed(2)}%</p>
          <p><strong>DenseNet121:</strong> ${(probabilities.densenet121 * 100).toFixed(2)}%</p>
          <p><strong>Counterfactual model:</strong> ${(probabilities.counterfactual * 100).toFixed(2)}%</p>
        </section>

        <section class="card full">
          <h3>Explainability summary</h3>
          <p>${escapeHtml(explanation.counterfactualText)}</p>
          <p>${escapeHtml(explanation.clinicalInsightText)}</p>
          <p><strong>Top counterfactual features</strong></p>
          <ul>${topFeatures}</ul>
        </section>

        <section class="card">
          <h3>Modality gates</h3>
          <p><strong>ResNet50:</strong> ${(gates.resnet50 * 100).toFixed(1)}%</p>
          <p><strong>DenseNet121:</strong> ${(gates.densenet121 * 100).toFixed(1)}%</p>
          <p><strong>Morphology:</strong> ${(gates.morphology * 100).toFixed(1)}%</p>
          <p><strong>Counterfactual:</strong> ${(gates.counterfactual * 100).toFixed(1)}%</p>
        </section>

        <section class="card">
          <h3>Doctor note</h3>
          <p>${escapeHtml(input.clinicalNote ?? "No note added at case creation.")}</p>
        </section>

        <section class="card full">
          <h3>Morphology features</h3>
          <table>
            <thead>
              <tr>
                <th>Feature</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              ${morphologyRows}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  </body>
</html>`;
}
