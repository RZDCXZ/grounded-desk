import { notFound } from "next/navigation";

import { createPrivilegedSupabaseClient } from "@/lib/supabase/privileged";

import { PublicConversation } from "./public-conversation";

export type PublicAssistant = {
  public_id: string;
  name: string;
  welcome_message: string;
  service_scope: string;
  tone: string;
  human_contact_label: string;
  human_contact_url: string;
};

export const dynamic = "force-dynamic";

export default async function PublicAssistantPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ embedded?: string }>;
}) {
  const { publicId } = await params;
  const { embedded } = await searchParams;
  const supabase = createPrivilegedSupabaseClient();
  const { data, error } = await supabase.rpc("get_published_assistant", {
    assistant_public_id: publicId,
  });
  const assistant = (data as PublicAssistant[] | null)?.[0];

  if (error || !assistant) {
    notFound();
  }

  return (
    <PublicConversation
      assistant={assistant}
      embedded={embedded === "1"}
      publicId={publicId}
    />
  );
}
