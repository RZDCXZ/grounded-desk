"use server";

import { revalidatePath } from "next/cache";

import { requireAdministrator } from "@/lib/auth/require-admin";

export type DeleteConversationActionResult =
  | { status: "success" }
  | { status: "error"; message: string };

export async function deleteConversation(
  conversationId: string,
): Promise<DeleteConversationActionResult> {
  const { supabase } = await requireAdministrator();
  const { error } = await supabase.rpc("delete_admin_conversation", {
    target_conversation_id: conversationId,
  });

  if (error) {
    return {
      status: "error",
      message: "暂时无法删除会话，请稍后重试。",
    };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/conversations");
  revalidatePath("/admin/unresolved-questions");

  return { status: "success" };
}
