const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

function requiredPublicValue(
  value: string | undefined,
  localFallback: string,
  name: string,
) {
  if (value) {
    return value;
  }

  if (process.env.NODE_ENV !== "production") {
    return localFallback;
  }

  throw new Error(`缺少生产环境变量 ${name}`);
}
export function getSupabasePublicConfig() {
  return {
    url: requiredPublicValue(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      LOCAL_SUPABASE_URL,
      "NEXT_PUBLIC_SUPABASE_URL",
    ),
    publishableKey: requiredPublicValue(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      LOCAL_SUPABASE_PUBLISHABLE_KEY,
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ),
  };
}
