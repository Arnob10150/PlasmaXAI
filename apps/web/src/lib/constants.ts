export const appConfig = {
  name: "PlasmaXAI",
  description: "Explainable plasma cell review workspace for doctors",
};

export const storageConfig = {
  caseImageBucket:
    process.env.NEXT_PUBLIC_SUPABASE_CASE_IMAGE_BUCKET ?? "plasmaxai-case-images",
  reportBucket:
    process.env.NEXT_PUBLIC_SUPABASE_REPORT_BUCKET ?? "plasmaxai-reports",
};
