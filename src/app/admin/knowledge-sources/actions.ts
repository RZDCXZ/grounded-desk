"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { requireAdministrator } from "@/lib/auth/require-admin";
import { getKnowledgeEmbeddingProvider } from "@/lib/ai/embeddings";
import { processManualKnowledgeRevision } from "@/lib/knowledge/process-manual";
import { createSupabaseKnowledgeRevisionRepository } from "@/lib/knowledge/supabase-revision-repository";

export type CreateManualSourceState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "created"; sourceId: string };

export async function createManualKnowledgeSource(
  _previousState: CreateManualSourceState,
  formData: FormData,
): Promise<CreateManualSourceState> {
  const { supabase, organization } = await requireAdministrator();
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

  const { data, error } = await supabase.rpc(
    "create_manual_knowledge_source",
    {
      source_title: title,
      source_body: body,
      source_original_url: originalUrl || null,
    },
  );
  const sourceId = data?.[0]?.knowledge_source_id;

  if (error || typeof sourceId !== "string") {
    return {
      status: "error",
      message: "暂时无法添加知识来源，请稍后重试。",
    };
  }

  revalidateKnowledgeSourcePaths();
  after(async () => {
    await delayKnowledgeProcessingForEndToEndTest();
    await processManualKnowledgeSourceForOrganization(
      supabase,
      organization.id,
      sourceId,
    );
    revalidateKnowledgeSourcePaths();
  });

  return { status: "created", sourceId };
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

async function processManualKnowledgeSourceForOrganization(
  supabase: SupabaseClient,
  organizationId: string,
  sourceId: string,
) {
  const { data: revision } = await supabase
    .from("knowledge_revisions")
    .select("id, title, body")
    .eq("organization_id", organizationId)
    .eq("knowledge_source_id", sourceId)
    .eq("status", "processing")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!revision) {
    return { status: "unchanged" } as const;
  }

  const result = await processManualKnowledgeRevision(
    revision,
    {
      embeddingProvider: getKnowledgeEmbeddingProvider(),
      revisionRepository: createSupabaseKnowledgeRevisionRepository(supabase),
    },
  );

  return result;
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
