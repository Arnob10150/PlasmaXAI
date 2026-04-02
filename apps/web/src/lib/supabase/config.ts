export function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}

export function getSupabasePublishableKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ""
  );
}

export function isHostedDeployment() {
  return Boolean(
    process.env.VERCEL ||
      process.env.VERCEL_ENV ||
      process.env.VERCEL_URL ||
      process.env.VERCEL_REGION ||
      process.env.AWS_REGION ||
      process.env.LAMBDA_TASK_ROOT ||
      process.cwd().startsWith("/var/task"),
  );
}

export function hasSupabaseConfig() {
  return Boolean(getSupabaseUrl() && getSupabasePublishableKey());
}

export function shouldUseFilesystemLocalStore() {
  return !hasSupabaseConfig() && !isHostedDeployment();
}

export function shouldUseHostedDemoFallback() {
  return !hasSupabaseConfig() && isHostedDeployment();
}
