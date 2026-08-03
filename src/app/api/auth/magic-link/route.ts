import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getAdminEmail } from "@/lib/env";
import { getAuthConfirmationUrl } from "@/lib/server-config";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const email =
    typeof body === "object" &&
    body !== null &&
    "email" in body &&
    typeof body.email === "string"
      ? body.email.trim().toLowerCase()
      : "";

  if (email !== getAdminEmail()) {
    return NextResponse.json({ ok: true });
  }

  const { url, publishableKey } = getSupabasePublicConfig();
  const supabase = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: getAuthConfirmationUrl(),
      shouldCreateUser: false,
    },
  });

  if (error) {
    return NextResponse.json(
      { ok: false, message: "暂时无法发送登录链接，请稍后重试。" },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
