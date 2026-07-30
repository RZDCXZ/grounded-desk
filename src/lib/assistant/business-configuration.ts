export const assistantTones = [
  "professional",
  "friendly",
  "concise",
] as const;

export type AssistantTone = (typeof assistantTones)[number];

export type AssistantBusinessConfigurationRecord = {
  id: string;
  name: string;
  welcome_message: string;
  service_scope: string;
  tone: AssistantTone;
  human_contact_label: string;
  human_contact_url: string;
  status: "draft" | "published" | "offline";
  public_id: string | null;
};

export type AssistantBusinessConfigurationValues = {
  name: string;
  welcomeMessage: string;
  serviceScope: string;
  tone: string;
  humanContactLabel: string;
  humanContactUrl: string;
};

export type AssistantBusinessConfigurationErrors = Partial<
  Record<keyof AssistantBusinessConfigurationValues, string>
>;

export type AssistantBusinessConfigurationActionState =
  | {
      status: "idle";
      message?: undefined;
      errors?: undefined;
    }
  | {
      status: "error";
      message: string;
      errors: AssistantBusinessConfigurationErrors;
    }
  | {
      status: "success";
      message: string;
      errors?: undefined;
    };

type ValidAssistantBusinessConfiguration = Omit<
  AssistantBusinessConfigurationValues,
  "tone"
> & {
  tone: AssistantTone;
};

export function validateAssistantBusinessConfiguration(
  values: AssistantBusinessConfigurationValues,
):
  | {
      status: "valid";
      configuration: ValidAssistantBusinessConfiguration;
    }
  | {
      status: "invalid";
      errors: AssistantBusinessConfigurationErrors;
    } {
  const configuration = {
    name: values.name.trim(),
    welcomeMessage: values.welcomeMessage.trim(),
    serviceScope: values.serviceScope.trim(),
    tone: values.tone.trim(),
    humanContactLabel: values.humanContactLabel.trim(),
    humanContactUrl: values.humanContactUrl.trim(),
  };
  const errors: AssistantBusinessConfigurationErrors = {};

  if (!configuration.name) {
    errors.name = "请输入助手名称。";
  } else if (configuration.name.length > 80) {
    errors.name = "助手名称不能超过 80 个字符。";
  }

  if (!configuration.welcomeMessage) {
    errors.welcomeMessage = "请输入欢迎语。";
  } else if (configuration.welcomeMessage.length > 500) {
    errors.welcomeMessage = "欢迎语不能超过 500 个字符。";
  }

  if (!configuration.serviceScope) {
    errors.serviceScope = "请输入服务范围说明。";
  } else if (configuration.serviceScope.length > 1000) {
    errors.serviceScope = "服务范围说明不能超过 1000 个字符。";
  }

  if (!isAssistantTone(configuration.tone)) {
    errors.tone = "请选择专业、友好或简洁。";
  }

  if (!configuration.humanContactLabel) {
    errors.humanContactLabel = "请输入人工联系入口文案。";
  } else if (configuration.humanContactLabel.length > 80) {
    errors.humanContactLabel = "人工联系入口文案不能超过 80 个字符。";
  }

  if (!configuration.humanContactUrl) {
    errors.humanContactUrl = "请输入人工联系 URL。";
  } else if (
    configuration.humanContactUrl.length > 2048 ||
    !isAllowedHumanContactUrl(configuration.humanContactUrl)
  ) {
    errors.humanContactUrl =
      "请输入有效的 HTTP、HTTPS 或邮件联系地址。";
  }

  if (Object.keys(errors).length > 0) {
    return { status: "invalid", errors };
  }

  return {
    status: "valid",
    configuration: {
      ...configuration,
      tone: configuration.tone as AssistantTone,
    },
  };
}

export function isAllowedHumanContactUrl(value: string) {
  try {
    const url = new URL(value);

    if (url.protocol === "http:" || url.protocol === "https:") {
      return Boolean(url.hostname);
    }

    if (url.protocol === "mailto:") {
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(url.pathname);
    }

    return false;
  } catch {
    return false;
  }
}

export function isAssistantTone(
  value: string,
): value is AssistantTone {
  return assistantTones.some((tone) => tone === value);
}
