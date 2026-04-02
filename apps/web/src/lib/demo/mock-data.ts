import type { ReportDraft, ReviewChecklistItem } from "@/lib/review-workspace";

export interface DemoDoctor {
  id: string;
  email: string;
  password: string;
  fullName: string;
  specialization: string;
}

export interface DemoCaseRecord {
  id: string;
  caseCode: string;
  title: string;
  status: string;
  notes: string | null;
  createdAt: string;
  reviewedAt: string | null;
  patient: {
    id: string;
    code: string;
    name: string | null;
  } | null;
  prediction: {
    predictedClass: string;
    confidence: number;
    riskLevel: string;
    modelVersion: string;
  } | null;
  reports: Array<{
    id: string;
    storagePath: string;
    reportType: string;
    generatedAt: string;
    signedUrl?: string | null;
  }>;
  images: Array<{
    id: string;
    fileName: string;
    storagePath: string;
    mimeType: string | null;
    signedUrl?: string | null;
  }>;
  explanation: {
    counterfactualText: string | null;
    clinicalInsightText: string | null;
    topFeatures: string[];
    heatmapPath: string | null;
  } | null;
  analysis?: {
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
  } | null;
  reviewChecklist?: ReviewChecklistItem[];
  reportDraft?: ReportDraft | null;
}

export const demoDoctors: DemoDoctor[] = [
  {
    id: "local-doctor-001",
    email: "arnob12@gmail.com",
    password: "arnob123",
    fullName: "Arnob Aich Anurag",
    specialization: "Hematopathology",
  },
  {
    id: "local-doctor-002",
    email: "shamiul12@gmail.com",
    password: "shamiul123",
    fullName: "Shamiul Islam",
    specialization: "Clinical Pathology",
  },
  {
    id: "local-doctor-003",
    email: "sadia12@gmail.com",
    password: "sadia123",
    fullName: "Sadia Sultana",
    specialization: "Hematology",
  },
];

export const demoDoctor: DemoDoctor = demoDoctors[0];

export function getDemoDoctorByEmail(email: string | null | undefined) {
  if (!email) {
    return demoDoctor;
  }

  return (
    demoDoctors.find((doctor) => doctor.email.toLowerCase() === email.toLowerCase()) ??
    demoDoctor
  );
}

export function getDemoDoctorByCredentials(
  email: string | null | undefined,
  password: string | null | undefined,
) {
  if (!email || !password) {
    return null;
  }

  return (
    demoDoctors.find(
      (doctor) =>
        doctor.email.toLowerCase() === email.toLowerCase() && doctor.password === password,
    ) ?? null
  );
}

export const demoCases: DemoCaseRecord[] = [
  {
    id: 'case-001',
    caseCode: 'PX-2026-001',
    title: 'Baseline marrow smear review',
    status: 'report_ready',
    notes: 'Marked for initial hematopathology assessment and report generation.',
    createdAt: '2026-04-01T08:30:00.000Z',
    reviewedAt: '2026-04-01T09:05:00.000Z',
    patient: {
      id: 'patient-001',
      code: 'PT-001',
      name: 'Rahim Uddin',
    },
    prediction: {
      predictedClass: 'Malignant plasma cell',
      confidence: 0.9342,
      riskLevel: 'High',
      modelVersion: 'PlasmaXAI v1.0',
    },
    reports: [],
    images: [
      {
        id: 'image-001',
        fileName: 'case-cell-1.jpg',
        storagePath: '/case-cell-1.jpg',
        mimeType: 'image/jpeg',
        signedUrl: '/case-cell-1.jpg',
      },
    ],
    explanation: {
      counterfactualText:
        'The model remained high-risk because the nucleus-to-cytoplasm balance and chromatic intensity pattern stayed closer to malignant prototypes than benign plasma cells.',
      clinicalInsightText:
        'The dominant signal is a coherent malignant morphology program rather than a single isolated feature, which is why the confidence remains stable across the fused branches.',
      topFeatures: ['NC ratio', 'Mean R intensity', 'Nucleus area'],
      heatmapPath: null,
    },
    analysis: {
      probabilities: {
        plasmaxai: 0.9342,
        resnet50: 0.9184,
        densenet121: 0.8927,
        counterfactual: 0.9075,
      },
      modalityGates: {
        resnet50: 0.31,
        densenet121: 0.24,
        morphology: 0.18,
        counterfactual: 0.27,
      },
      morphology: {
        nc_ratio: 0.86,
        nucleus_area: 0.78,
        mean_r: 0.82,
        mean_b: 0.63,
        perimeter: 0.58,
        circularity: 0.41,
      },
    },
  },
  {
    id: 'case-002',
    caseCode: 'PX-2026-002',
    title: 'Follow-up plasma cell review',
    status: 'reviewed',
    notes: 'Follow-up review after response-to-treatment check.',
    createdAt: '2026-03-27T10:15:00.000Z',
    reviewedAt: '2026-03-27T10:42:00.000Z',
    patient: {
      id: 'patient-001',
      code: 'PT-001',
      name: 'Rahim Uddin',
    },
    prediction: {
      predictedClass: 'Suspicious plasma cell',
      confidence: 0.8121,
      riskLevel: 'Moderate',
      modelVersion: 'PlasmaXAI v1.0',
    },
    reports: [],
    images: [
      {
        id: 'image-002',
        fileName: 'case-cell-2.jpg',
        storagePath: '/case-cell-2.jpg',
        mimeType: 'image/jpeg',
        signedUrl: '/case-cell-2.jpg',
      },
    ],
    explanation: {
      counterfactualText:
        'A modest reduction in nuclear prominence and red-channel intensity would move this sample closer to the benign decision boundary.',
      clinicalInsightText:
        'Compared with the earlier case, the fused confidence is lower, suggesting a less dominant malignant morphology signature while still staying above the review threshold.',
      topFeatures: ['Mean B intensity', 'Cell circularity', 'Perimeter'],
      heatmapPath: null,
    },
    analysis: {
      probabilities: {
        plasmaxai: 0.8121,
        resnet50: 0.7895,
        densenet121: 0.7412,
        counterfactual: 0.7764,
      },
      modalityGates: {
        resnet50: 0.28,
        densenet121: 0.22,
        morphology: 0.21,
        counterfactual: 0.29,
      },
      morphology: {
        nc_ratio: 0.64,
        mean_b: 0.71,
        perimeter: 0.59,
        circularity: 0.57,
        texture_smoothness: 0.44,
        cytoplasm_area: 0.39,
      },
    },
  },
  {
    id: 'case-003',
    caseCode: 'PX-2026-003',
    title: 'Screening smear sample',
    status: 'new',
    notes: null,
    createdAt: '2026-03-25T07:55:00.000Z',
    reviewedAt: null,
    patient: {
      id: 'patient-002',
      code: 'PT-002',
      name: 'Nusrat Jahan',
    },
    prediction: {
      predictedClass: 'Likely benign plasma cell',
      confidence: 0.7144,
      riskLevel: 'Low',
      modelVersion: 'PlasmaXAI v1.0',
    },
    reports: [],
    images: [
      {
        id: 'image-003',
        fileName: 'case-cell-3.jpg',
        storagePath: '/case-cell-3.jpg',
        mimeType: 'image/jpeg',
        signedUrl: '/case-cell-3.jpg',
      },
    ],
    explanation: {
      counterfactualText:
        'This sample stays on the benign side because the morphology branch and the counterfactual path both see enough separation from malignant prototypes.',
      clinicalInsightText:
        'The review signal is low-risk, but the case is still kept in the queue so the doctor can compare it against prior samples and close the loop with a documented decision.',
      topFeatures: ['Cytoplasm area', 'Texture smoothness', 'Mean G intensity'],
      heatmapPath: null,
    },
    analysis: {
      probabilities: {
        plasmaxai: 0.2856,
        resnet50: 0.3172,
        densenet121: 0.2948,
        counterfactual: 0.2619,
      },
      modalityGates: {
        resnet50: 0.24,
        densenet121: 0.2,
        morphology: 0.3,
        counterfactual: 0.26,
      },
      morphology: {
        cytoplasm_area: 0.73,
        texture_smoothness: 0.68,
        mean_g: 0.62,
        nucleus_area: 0.33,
        nc_ratio: 0.29,
        perimeter: 0.35,
      },
    },
  },
];
