"use server";

import { revalidatePath } from "next/cache";

import {
  type AssistantBusinessConfigurationActionState,
  type AssistantBusinessConfigurationValues,
  validateAssistantBusinessConfiguration,
} from "@/lib/assistant/business-configuration";
import { requireAdministrator } from "@/lib/auth/require-admin";

function readFormValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function updateAssistantBusinessConfiguration(
  _previousState: AssistantBusinessConfigurationActionState,
  formData: FormData,
): Promise<AssistantBusinessConfigurationActionState> {
  const { supabase } = await requireAdministrator();
  const values: AssistantBusinessConfigurationValues = {
    name: readFormValue(formData, "name"),
    welcomeMessage: readFormValue(formData, "welcomeMessage"),
    serviceScope: readFormValue(formData, "serviceScope"),
    tone: readFormValue(formData, "tone"),
    humanContactLabel: readFormValue(formData, "humanContactLabel"),
    humanContactUrl: readFormValue(formData, "humanContactUrl"),
  };
  const result = validateAssistantBusinessConfiguration(values);

  if (result.status === "invalid") {
    return {
      status: "error",
      message: "请检查标出的配置内容。",
      errors: result.errors,
    };
  }

  const { configuration } = result;
  const { error } = await supabase.rpc(
    "update_assistant_business_configuration",
    {
      assistant_name: configuration.name,
      assistant_welcome_message: configuration.welcomeMessage,
      assistant_service_scope: configuration.serviceScope,
      assistant_tone: configuration.tone,
      assistant_human_contact_label: configuration.humanContactLabel,
      assistant_human_contact_url: configuration.humanContactUrl,
    },
  );

  if (error) {
    return {
      status: "error",
      message: "暂时无法保存助手配置，请稍后重试。",
      errors: {},
    };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/assistant");

  return {
    status: "success",
    message: "助手配置已保存。",
  };
}

export async function publishAssistant() {
  const { supabase } = await requireAdministrator();
  const { error } = await supabase.rpc("publish_assistant");

  if (error) {
    throw new Error("暂时无法发布助手，请稍后重试。", {
      cause: error,
    });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/assistant");
}

export async function takeAssistantOffline() {
  const { supabase } = await requireAdministrator();
  const { error } = await supabase.rpc("take_assistant_offline");

  if (error) {
    throw new Error("暂时无法下线助手，请稍后重试。", {
      cause: error,
    });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/assistant");
}
