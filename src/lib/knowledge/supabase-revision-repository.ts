import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CompletedKnowledgeRevision,
  KnowledgeRevisionRepository,
} from "@/lib/knowledge/process-revision";

export function createSupabaseKnowledgeRevisionRepository(
  supabase: SupabaseClient,
): KnowledgeRevisionRepository {
  return createRepository(supabase, "complete_knowledge_revision");
}

export function createSupabaseWebKnowledgeRevisionRepository(
  supabase: SupabaseClient,
): KnowledgeRevisionRepository {
  return createRepository(supabase, "complete_web_knowledge_revision");
}

function createRepository(
  supabase: SupabaseClient,
  completionFunction:
    | "complete_knowledge_revision"
    | "complete_web_knowledge_revision",
): KnowledgeRevisionRepository {
  return {
    async advanceStage(revisionId, stage) {
      const { error } = await supabase.rpc(
        "advance_knowledge_revision_stage",
        {
          revision_id: revisionId,
          next_stage: stage,
        },
      );

      if (error) {
        throw new Error("无法更新知识版本处理阶段", { cause: error });
      }
    },
    async complete(revision: CompletedKnowledgeRevision) {
      const { error } = await supabase.rpc(completionFunction, {
        revision_id: revision.id,
        revision_content_units: revision.contentUnits,
      });

      if (error) {
        throw new Error("无法保存完整知识版本", { cause: error });
      }
    },
    async fail(revisionId, reason) {
      const { error } = await supabase.rpc("fail_knowledge_revision", {
        revision_id: revisionId,
        safe_failure_reason: reason,
      });

      if (error) {
        throw new Error("无法保存知识处理失败状态", { cause: error });
      }
    },
  };
}

export async function prepareSupabaseWebKnowledgeRevision(
  supabase: SupabaseClient,
  revision: { id: string; title: string; body: string },
) {
  const { error } = await supabase.rpc("prepare_web_knowledge_revision", {
    revision_id: revision.id,
    extracted_title: revision.title,
    extracted_body: revision.body,
  });

  if (error) {
    throw new Error("无法保存网页知识版本", { cause: error });
  }
}
