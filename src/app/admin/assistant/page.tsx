import { requireAdministrator } from "@/lib/auth/require-admin";
import type { AssistantBusinessConfigurationRecord } from "@/lib/assistant/business-configuration";

import { AssistantBusinessConfigurationForm } from "./assistant-business-configuration-form";

export default async function AssistantConfigurationPage() {
  const { supabase, organization } = await requireAdministrator();
  const { data, error } = await supabase
    .from("assistants")
    .select(
      "id, name, welcome_message, service_scope, tone, human_contact_label, human_contact_url, status",
    )
    .eq("organization_id", organization.id)
    .single();

  if (error || !data) {
    throw new Error("无法加载助手配置。");
  }

  return (
    <AssistantBusinessConfigurationForm
      assistant={data as AssistantBusinessConfigurationRecord}
    />
  );
}
