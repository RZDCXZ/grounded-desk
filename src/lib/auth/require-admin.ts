import "server-only";

import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function requireAdministrator() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership, error } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("role", "administrator")
    .maybeSingle();

  if (error || !membership) {
    redirect("/unauthorized");
  }

  const { data: organization } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", membership.organization_id)
    .single();

  if (!organization) {
    redirect("/unauthorized");
  }

  return {
    supabase,
    user,
    organization,
  };
}
