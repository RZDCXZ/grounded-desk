"use server";

import { revalidatePath } from "next/cache";

import { requireAdministrator } from "@/lib/auth/require-admin";

export async function markUnresolvedQuestionResolved(formData: FormData) {
  const unresolvedQuestionId = formData.get("unresolvedQuestionId");

  if (
    typeof unresolvedQuestionId !== "string" ||
    !unresolvedQuestionId.trim()
  ) {
    return;
  }

  const { organization, supabase } = await requireAdministrator();
  const { error } = await supabase
    .from("unresolved_questions")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
    })
    .eq("id", unresolvedQuestionId)
    .eq("organization_id", organization.id)
    .eq("status", "pending");

  if (error) {
    throw new Error("暂时无法将待解决问题标记为已解决", {
      cause: error,
    });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/unresolved-questions");
  revalidatePath("/admin/conversations");
}
