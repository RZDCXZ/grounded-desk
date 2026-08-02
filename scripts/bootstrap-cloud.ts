import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const organizationName = "GroundedDesk";
const organizationSlug = "groundeddesk";

try {
  const configuration = readConfiguration(process.env);
  const supabase = createClient(
    configuration.supabaseUrl,
    configuration.secretKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  const result = await bootstrapCloud(supabase, configuration.adminEmail);

  process.stdout.write([
    "GroundedDesk 云端必要初始化通过",
    `管理员：${maskEmail(configuration.adminEmail)}`,
    `组织：${result.organizationCreated ? "CREATED" : "EXISTING"}`,
    `草稿助手：${result.assistantCreated ? "CREATED" : "EXISTING"}`,
    "知识来源写入：0（未复制本地业务数据）",
    "会话写入：0（未复制本地业务数据）",
  ].join("\n") + "\n");
} catch (error) {
  const message = error instanceof Error ? error.message : "未知错误";
  process.stderr.write(`云端必要初始化失败：${message}\n`);
  process.exitCode = 1;
}

function readConfiguration(environment: NodeJS.ProcessEnv) {
  const supabaseUrl = environment.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = environment.SUPABASE_SECRET_KEY;
  const adminEmail = environment.ADMIN_EMAIL?.trim().toLowerCase();

  if (!supabaseUrl || !secretKey || !adminEmail) {
    throw new Error(
      "缺少 NEXT_PUBLIC_SUPABASE_URL、SUPABASE_SECRET_KEY 或 ADMIN_EMAIL",
    );
  }
  if (!supabaseUrl.startsWith("https://") || !secretKey.startsWith("sb_secret_")) {
    throw new Error("必要初始化只允许使用 Supabase Cloud URL 与 secret key");
  }

  return { supabaseUrl, secretKey, adminEmail };
}

async function bootstrapCloud(supabase: SupabaseClient, adminEmail: string) {
  const { data: users, error: listUsersError } =
    await supabase.auth.admin.listUsers({ page: 1, perPage: 1_000 });
  if (listUsersError) {
    throw new Error("无法读取云端 Auth 用户", { cause: listUsersError });
  }
  let administrator = users.users.find(
    ({ email }) => email?.toLowerCase() === adminEmail,
  );
  if (!administrator) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: adminEmail,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error("无法创建云端管理员 Auth 用户", { cause: error });
    }
    administrator = data.user;
  }

  const { data: existingOrganization, error: readOrganizationError } =
    await supabase
      .from("organizations")
      .select("id")
      .eq("slug", organizationSlug)
      .maybeSingle();
  if (readOrganizationError) {
    throw new Error("无法读取云端组织", { cause: readOrganizationError });
  }

  let organization = existingOrganization;
  let organizationCreated = false;
  if (!organization) {
    const { data, error } = await supabase
      .from("organizations")
      .insert({ name: organizationName, slug: organizationSlug })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error("无法创建云端组织", { cause: error });
    }
    organization = data;
    organizationCreated = true;
  }

  const { error: membershipError } = await supabase
    .from("organization_members")
    .upsert(
      {
        organization_id: organization.id,
        user_id: administrator.id,
        role: "administrator",
      },
      { onConflict: "organization_id,user_id" },
    );
  if (membershipError) {
    throw new Error("无法建立云端管理员成员关系", {
      cause: membershipError,
    });
  }

  const { data: existingAssistant, error: readAssistantError } =
    await supabase
      .from("assistants")
      .select("id")
      .eq("organization_id", organization.id)
      .maybeSingle();
  if (readAssistantError) {
    throw new Error("无法读取云端助手", { cause: readAssistantError });
  }

  let assistantCreated = false;
  if (!existingAssistant) {
    const { error } = await supabase.from("assistants").insert({
      organization_id: organization.id,
      name: "GroundedDesk 助手",
      welcome_message: "你好，我可以依据已维护的知识来源回答问题。",
      service_scope: "依据管理员维护的知识来源回答业务事实。",
      tone: "professional",
      human_contact_label: "联系人工",
      human_contact_url: `mailto:${adminEmail}`,
      status: "draft",
      public_id: null,
    });
    if (error) {
      throw new Error("无法创建云端草稿助手", { cause: error });
    }
    assistantCreated = true;
  }

  return { organizationCreated, assistantCreated };
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local?.slice(0, 1) ?? "*"}***@${domain ?? "***"}`;
}
