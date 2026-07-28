"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { requireAdministrator } from "@/lib/auth/require-admin";
import { getKnowledgeEmbeddingProvider } from "@/lib/ai/embeddings";
import {
  createDefaultWebFetchDependencies,
  fetchWebKnowledgePage,
  parseWebSourceUrl,
} from "@/lib/knowledge/fetch-web-page";
import { processKnowledgeRevision } from "@/lib/knowledge/process-revision";
import { processWebKnowledgeRevision } from "@/lib/knowledge/process-web";
import {
  createSupabaseKnowledgeRevisionRepository,
  createSupabaseWebKnowledgeRevisionRepository,
  prepareSupabaseWebKnowledgeRevision,
} from "@/lib/knowledge/supabase-revision-repository";

export type CreateManualSourceState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "created"; sourceId: string };

export type CreateWebSourceState = CreateManualSourceState;

export type UpdateManualSourceState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "updated" };

export type KnowledgeSourceActionState =
  | { status: "success" }
  | { status: "error"; message: string };

type ManualKnowledgeSourceInput = {
  title: string;
  body: string;
  originalUrl: string;
};

export async function createManualKnowledgeSource(
  _previousState: CreateManualSourceState,
  formData: FormData,
): Promise<CreateManualSourceState> {
  const { supabase, organization } = await requireAdministrator();
  const inputResult = readManualKnowledgeSourceInput(formData);

  if (inputResult.status === "error") {
    return inputResult;
  }

  const { body, originalUrl, title } = inputResult.input;
  const { data, error } = await supabase.rpc(
    "create_manual_knowledge_source",
    {
      source_title: title,
      source_body: body,
      source_original_url: originalUrl || null,
    },
  );
  const sourceId = data?.[0]?.knowledge_source_id;
  const revisionId = data?.[0]?.knowledge_revision_id;

  if (
    error ||
    typeof sourceId !== "string" ||
    typeof revisionId !== "string"
  ) {
    return {
      status: "error",
      message: "暂时无法添加知识来源，请稍后重试。",
    };
  }

  scheduleKnowledgeRevisionProcessing(() =>
    processManualKnowledgeRevision(
      supabase,
      organization.id,
      revisionId,
    ),
  );

  return { status: "created", sourceId };
}

export async function createWebKnowledgeSource(
  _previousState: CreateWebSourceState,
  formData: FormData,
): Promise<CreateWebSourceState> {
  const { supabase } = await requireAdministrator();
  const submittedUrl = readFormValue(formData, "url");
  const sourceUrl = parseWebSourceUrl(submittedUrl);

  if (!sourceUrl || submittedUrl.length > 2048) {
    return {
      status: "error",
      message: "请输入有效且不含登录凭据的 HTTP 或 HTTPS 网页地址。",
    };
  }

  const { data, error } = await supabase.rpc("create_web_knowledge_source", {
    source_url: sourceUrl.href,
    placeholder_title: sourceUrl.hostname.slice(0, 160),
  });
  const sourceId = data?.[0]?.knowledge_source_id;
  const revisionId = data?.[0]?.knowledge_revision_id;

  if (
    error ||
    typeof sourceId !== "string" ||
    typeof revisionId !== "string"
  ) {
    return {
      status: "error",
      message: "暂时无法添加网页知识来源，请稍后重试。",
    };
  }

  scheduleKnowledgeRevisionProcessing(() =>
    processWebKnowledgeSourceRevision(
      supabase,
      revisionId,
      sourceUrl.href,
    ),
  );

  return { status: "created", sourceId };
}

export async function setKnowledgeSourceEnabled(
  sourceId: string,
  enabled: boolean,
): Promise<KnowledgeSourceActionState> {
  const { supabase } = await requireAdministrator();
  const { error } = await supabase.rpc("set_knowledge_source_enabled", {
    target_source_id: sourceId,
    source_enabled: enabled,
  });

  if (error) {
    return {
      status: "error",
      message: enabled
        ? "暂时无法重新启用知识来源，请稍后重试。"
        : "暂时无法停用知识来源，请稍后重试。",
    };
  }

  revalidateKnowledgeSourcePaths();
  return { status: "success" };
}

export async function updateManualKnowledgeSource(
  _previousState: UpdateManualSourceState,
  formData: FormData,
): Promise<UpdateManualSourceState> {
  const { supabase, organization } = await requireAdministrator();
  const sourceId = readFormValue(formData, "sourceId");

  if (!sourceId) {
    return { status: "error", message: "知识来源不存在，请刷新后重试。" };
  }

  const inputResult = readManualKnowledgeSourceInput(formData);

  if (inputResult.status === "error") {
    return inputResult;
  }

  const { body, originalUrl, title } = inputResult.input;
  const { data, error } = await supabase.rpc(
    "update_manual_knowledge_source",
    {
      target_source_id: sourceId,
      source_title: title,
      source_body: body,
      source_original_url: originalUrl || null,
    },
  );
  const revisionId = data?.[0]?.knowledge_revision_id;

  if (error || typeof revisionId !== "string") {
    return {
      status: "error",
      message: "暂时无法更新手工知识来源，请稍后重试。",
    };
  }

  scheduleKnowledgeRevisionProcessing(() =>
    processManualKnowledgeRevision(
      supabase,
      organization.id,
      revisionId,
    ),
  );

  return { status: "updated" };
}

export async function refreshWebKnowledgeSource(
  sourceId: string,
): Promise<KnowledgeSourceActionState> {
  const { supabase } = await requireAdministrator();
  const { data, error } = await supabase.rpc(
    "refresh_web_knowledge_source",
    {
      target_source_id: sourceId,
    },
  );
  const refresh = data?.[0];

  if (
    error ||
    typeof refresh?.knowledge_revision_id !== "string" ||
    typeof refresh.original_url !== "string"
  ) {
    return {
      status: "error",
      message: "暂时无法重新处理网页知识来源，请稍后重试。",
    };
  }

  scheduleKnowledgeRevisionProcessing(() =>
    processWebKnowledgeSourceRevision(
      supabase,
      refresh.knowledge_revision_id,
      refresh.original_url,
    ),
  );

  return { status: "success" };
}

export async function retryKnowledgeSource(
  sourceId: string,
): Promise<KnowledgeSourceActionState> {
  const { supabase, organization } = await requireAdministrator();
  const { data, error } = await supabase.rpc("retry_knowledge_source", {
    target_source_id: sourceId,
  });
  const retry = data?.[0];

  if (
    error ||
    typeof retry?.knowledge_revision_id !== "string" ||
    (retry.source_type !== "manual" && retry.source_type !== "url") ||
    (retry.source_type === "url" && typeof retry.original_url !== "string")
  ) {
    return {
      status: "error",
      message: "暂时无法重试知识来源，请稍后再试。",
    };
  }

  scheduleKnowledgeRevisionProcessing(async () => {
    if (retry.source_type === "url") {
      await processWebKnowledgeSourceRevision(
        supabase,
        retry.knowledge_revision_id,
        retry.original_url,
      );
    } else {
      await processManualKnowledgeRevision(
        supabase,
        organization.id,
        retry.knowledge_revision_id,
      );
    }
  });

  return { status: "success" };
}

export async function deleteKnowledgeSource(
  sourceId: string,
): Promise<KnowledgeSourceActionState> {
  const { supabase } = await requireAdministrator();
  const { error } = await supabase.rpc("delete_knowledge_source", {
    target_source_id: sourceId,
  });

  if (error) {
    return {
      status: "error",
      message: "暂时无法删除知识来源，请稍后重试。",
    };
  }

  revalidateKnowledgeSourcePaths();
  return { status: "success" };
}

async function processWebKnowledgeSourceRevision(
  supabase: SupabaseClient,
  revisionId: string,
  originalUrl: string,
) {
  const revisionRepository =
    createSupabaseWebKnowledgeRevisionRepository(supabase);

  return processWebKnowledgeRevision(
    { id: revisionId, originalUrl },
    {
      fetchPage(url, beforeExtract) {
        return fetchWebKnowledgePage(
          url,
          {
            ...createDefaultWebFetchDependencies(),
            beforeExtract,
          },
        );
      },
      prepareRevision(revision) {
        return prepareSupabaseWebKnowledgeRevision(supabase, revision);
      },
      embeddingProvider: getKnowledgeEmbeddingProvider(),
      revisionRepository,
    },
  );
}

async function delayKnowledgeProcessingForEndToEndTest() {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const delay = Number(process.env.E2E_KNOWLEDGE_PROCESSING_DELAY_MS ?? 0);
  if (Number.isFinite(delay) && delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

async function processManualKnowledgeRevision(
  supabase: SupabaseClient,
  organizationId: string,
  revisionId: string,
) {
  const { data: revision } = await supabase
    .from("knowledge_revisions")
    .select("id, title, body")
    .eq("organization_id", organizationId)
    .eq("id", revisionId)
    .eq("status", "processing")
    .maybeSingle();

  if (!revision) {
    return { status: "unchanged" } as const;
  }

  const result = await processKnowledgeRevision(
    revision,
    {
      embeddingProvider: getKnowledgeEmbeddingProvider(),
      revisionRepository: createSupabaseKnowledgeRevisionRepository(supabase),
    },
  );

  return result;
}

function scheduleKnowledgeRevisionProcessing(
  processRevision: () => Promise<unknown>,
) {
  revalidateKnowledgeSourcePaths();
  after(async () => {
    await delayKnowledgeProcessingForEndToEndTest();
    await processRevision();
    revalidateKnowledgeSourcePaths();
  });
}

function readManualKnowledgeSourceInput(
  formData: FormData,
):
  | { status: "valid"; input: ManualKnowledgeSourceInput }
  | { status: "error"; message: string } {
  const title = readFormValue(formData, "title");
  const body = readFormValue(formData, "body");
  const originalUrl = readFormValue(formData, "originalUrl");

  if (!title || title.length > 160) {
    return {
      status: "error",
      message: "请填写 1 至 160 个字符的标题。",
    };
  }

  if (!body) {
    return { status: "error", message: "请填写正文内容。" };
  }

  if (
    originalUrl &&
    (originalUrl.length > 2048 || !isPublicHttpUrl(originalUrl))
  ) {
    return {
      status: "error",
      message: "原始 URL 必须是有效的 HTTP 或 HTTPS 地址。",
    };
  }

  return { status: "valid", input: { title, body, originalUrl } };
}

function revalidateKnowledgeSourcePaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/knowledge-sources");
}

function readFormValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function isPublicHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
