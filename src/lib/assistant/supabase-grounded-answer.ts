import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getKnowledgeEmbeddingProviderWithMetadata } from "@/lib/ai/embeddings";
import {
  getGroundedAnswerGenerationProvider,
  getGroundedAnswerRerankingProvider,
} from "@/lib/ai/grounded-answer-providers";
import type {
  AiCallLog,
  RetrievedContentUnit,
} from "@/lib/assistant/grounded-answer";

type RetrievedContentUnitRow = {
  content_unit_id: string;
  knowledge_source_id: string;
  source_title: string;
  source_url: string | null;
  heading: string | null;
  content: string;
  similarity: number;
};

export function createSupabaseGroundedAnswerDependencies(
  supabase: SupabaseClient,
) {
  const embeddingProvider = getKnowledgeEmbeddingProviderWithMetadata();

  return {
    questionEmbeddingProvider: {
      provider: embeddingProvider.provider,
      model: embeddingProvider.model,
      async embed(question: string) {
        const result = await embeddingProvider.embed([question]);
        const embedding = result.value[0];

        if (!embedding) {
          throw new Error("问题向量服务未返回向量");
        }

        return {
          ...result,
          value: embedding,
        };
      },
    },
    candidateRepository: createCandidateRepository(supabase),
    rerankingProvider: getGroundedAnswerRerankingProvider(),
    answerProvider: getGroundedAnswerGenerationProvider(),
    callLogger: createCallLogger(supabase),
    config: {
      candidateLimit: readIntegerConfig(
        "RETRIEVAL_CANDIDATE_LIMIT",
        20,
        1,
        100,
      ),
      evidenceLimit: readIntegerConfig("RERANK_EVIDENCE_LIMIT", 5, 1, 20),
      evidenceThreshold: readNumberConfig(
        "RERANK_EVIDENCE_THRESHOLD",
        0.5,
        0,
        1,
      ),
    },
  };
}

function createCandidateRepository(supabase: SupabaseClient) {
  return {
    async retrieve(
      _organizationId: string,
      embedding: number[],
      limit: number,
    ): Promise<RetrievedContentUnit[]> {
      const { data, error } = await supabase.rpc(
        "retrieve_available_content_units",
        {
          query_embedding: embedding,
          candidate_limit: limit,
        },
      );

      if (error) {
        throw new Error("无法召回可用内容单元", { cause: error });
      }

      return ((data ?? []) as RetrievedContentUnitRow[]).map((row) => ({
        id: row.content_unit_id,
        knowledgeSourceId: row.knowledge_source_id,
        sourceTitle: row.source_title,
        sourceUrl: row.source_url,
        heading: row.heading,
        content: row.content,
        similarity: row.similarity,
      }));
    },
  };
}

function createCallLogger(supabase: SupabaseClient) {
  return {
    async record(log: AiCallLog) {
      const { error } = await supabase.from("ai_call_logs").insert({
        organization_id: log.organizationId,
        call_type: log.callType,
        provider: log.provider,
        model: log.model,
        input_tokens: log.inputTokens,
        output_tokens: log.outputTokens,
        total_tokens: log.totalTokens,
        duration_ms: log.durationMs,
        outcome: log.outcome,
        error_type: log.errorType,
        trace_id: log.traceId,
      });

      if (error) {
        throw new Error("无法记录供应商调用元数据", { cause: error });
      }
    },
  };
}

function readIntegerConfig(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const value = Number(process.env[name] ?? fallback);

  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`服务端配置 ${name} 必须是 ${minimum}–${maximum} 的整数`);
  }

  return value;
}

function readNumberConfig(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const value = Number(process.env[name] ?? fallback);

  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`服务端配置 ${name} 必须介于 ${minimum} 和 ${maximum}`);
  }

  return value;
}
