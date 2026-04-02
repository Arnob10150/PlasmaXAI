import { createBrowserClient } from "@supabase/ssr";
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
} from "@/lib/supabase/config";

export function createClient() {
  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();
  const standaloneMessage =
    "This workspace is running in standalone mode. Use the built-in doctor access flow.";

  if (!url || !key) {
    return {
      auth: {
        async signOut() {
          return { error: { message: standaloneMessage } };
        },
        async signInWithPassword() {
          return { data: null, error: { message: standaloneMessage } };
        },
        async signInWithOtp() {
          return { data: null, error: { message: standaloneMessage } };
        },
        async signUp() {
          return { data: null, error: { message: standaloneMessage } };
        },
      },
    } as any;
  }

  return createBrowserClient(url, key);
}
