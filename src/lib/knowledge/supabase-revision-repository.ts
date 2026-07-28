import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CompletedKnowledgeRevision,
  KnowledgeRevisionRepository,
} from "@/lib/knowledge/process-manual";

export function createSupabaseKnowledgeRevisionRepository(
  supabase: SupabaseClient,
): KnowledgeRevisionRepository {
  return {
    async complete(revision: CompletedKnowledgeRevision) {
      const { error } = await supabase.rpc(
        "complete_manual_knowledge_revision",
        {
          revision_id: revision.id,
          revision_content_units: revision.contentUnits,
        },
      );

      if (error) {
        throw new Error("无法保存完整知识版本", { cause: error });
      }
    },
    async fail(revisionId, reason) {
      const { error } = await supabase.rpc("fail_manual_knowledge_revision", {
        revision_id: revisionId,
        safe_failure_reason: reason,
      });

      if (error) {
        throw new Error("无法保存知识处理失败状态", { cause: error });
      }
    },
  };
}
