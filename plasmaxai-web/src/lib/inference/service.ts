import { execFile } from "child_process";
import path from "path";
import { promisify } from "util";

export interface InferenceResult {
  caseId: string;
  caseCode: string;
  patientCode: string;
  title: string;
  status: "completed";
  framework: string;
  modelVersion: string;
  threshold: number;
  prediction: {
    label: string;
    confidence: number;
    plasmaProbability: number;
    riskLevel: string;
    predictedClassText: string;
  };
  explanation: {
    counterfactualText: string;
    clinicalInsightText: string;
    topFeatures: string[];
  };
  probabilities: {
    plasmaxai: number;
    resnet50: number;
    densenet121: number;
    counterfactual: number;
  };
  modalityGates: {
    resnet50: number;
    densenet121: number;
    morphology: number;
    counterfactual: number;
  };
  morphology: Record<string, number>;
}

interface QueueInferencePayload {
  caseId: string;
  caseCode: string;
  patientCode: string;
  title: string;
  imagePath: string;
  imageBucket?: string;
}

const execFileAsync = promisify(execFile);

function getInferenceApiUrl() {
  return process.env.INFERENCE_API_URL?.trim() || "http://127.0.0.1:8000";
}

async function runLocalInference(payload: QueueInferencePayload) {
  const scriptPath = path.join(
    process.cwd(),
    "..",
    "plasmaxai-inference",
    "run_case_inference.py",
  );
  const args = [
    scriptPath,
    "--case-id",
    payload.caseId,
    "--case-code",
    payload.caseCode,
    "--patient-code",
    payload.patientCode,
    "--title",
    payload.title,
    "--image-path",
    payload.imagePath,
  ];

  if (payload.imageBucket) {
    args.push("--image-bucket", payload.imageBucket);
  }

  const { stdout } = await execFileAsync("python", args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PLASMAXAI_PROJECT_ROOT: path.join(process.cwd(), ".."),
      PYTHONUTF8: "1",
    },
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
  });

  const result = JSON.parse(stdout.trim()) as InferenceResult;
  return { queued: true as const, reason: null, result };
}

export async function queueCaseInference(payload: QueueInferencePayload) {
  const baseUrl = getInferenceApiUrl();

  if (baseUrl) {
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/cases`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Inference API returned ${response.status}.`);
      }

      const result = (await response.json()) as InferenceResult;
      return { queued: true as const, reason: null, result };
    } catch {
      return runLocalInference(payload);
    }
  }

  return runLocalInference(payload);
}
