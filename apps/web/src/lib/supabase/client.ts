import { createBrowserClient } from "@supabase/ssr";
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
} from "@/lib/supabase/config";

export function createClient() {
  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();

  if (!url || !key) {
    return {
      auth: {
        async signOut() {
          return { error: { message: "Supabase is not configured for this local workspace." } };
        },
        async signInWithPassword() {
          return { data: null, error: { message: "Supabase is not configured for this local workspace." } };
        },
        async signInWithOtp() {
          return { data: null, error: { message: "Supabase is not configured for this local workspace." } };
        },
        async signUp() {
          return { data: null, error: { message: "Supabase is not configured for this local workspace." } };
        },
      },
    } as any;
  }

  return createBrowserClient(url, key);
}
