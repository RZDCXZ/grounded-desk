import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getKnowledgeEmbeddingProviderWithMetadata } from "@/lib/ai/embeddings";
import {
  getGroundedAnswerGenerationProvider,
  getGroundedAnswerRerankingProvider,
} from "@/lib/ai/grounded-answer-providers";
import { readRetrievalConfig } from "@/lib/assistant/retrieval-config";
import type {
  AiCallLog,
  RetrievedContentUnit,
} from "@/lib/assistant/grounded-answer";
import { readIntegerServerConfig } from "@/lib/server-config";

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
  return createConfiguredDependencies(
    createCandidateRepository(supabase),
    createCallLogger(supabase),
  );
}

export function createPublicSupabaseGroundedAnswerDependencies(
  supabase: SupabaseClient,
  assistantPublicId: string,
) {
  return createConfiguredDependencies(
    createPublicCandidateRepository(supabase, assistantPublicId),
    createPublicCallLogger(supabase, assistantPublicId),
  );
}

function createConfiguredDependencies(
  candidateRepository: ReturnType<typeof createCandidateRepository>,
  callLogger: ReturnType<typeof createCallLogger>,
) {
  const embeddingProvider = getKnowledgeEmbeddingProviderWithMetadata();
  const retrievalConfig = readRetrievalConfig();

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
    candidateRepository,
    rerankingProvider: getGroundedAnswerRerankingProvider(),
    answerProvider: getGroundedAnswerGenerationProvider(),
    callLogger,
    rateLimitRetry: {
      delayMs: readIntegerServerConfig(
        process.env,
        "PROVIDER_RATE_LIMIT_RETRY_DELAY_MS",
        250,
        0,
        2_000,
      ),
      async wait(delayMs: number) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      },
    },
    config: retrievalConfig,
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

function createPublicCandidateRepository(
  supabase: SupabaseClient,
  assistantPublicId: string,
) {
  return {
    async retrieve(
      _organizationId: string,
      embedding: number[],
      limit: number,
    ): Promise<RetrievedContentUnit[]> {
      const { data, error } = await supabase.rpc(
        "retrieve_public_assistant_content_units",
        {
          assistant_public_id: assistantPublicId,
          query_embedding: embedding,
          candidate_limit: limit,
        },
      );

      if (error) {
        throw new Error("无法召回公开助手的可用内容单元", {
          cause: error,
        });
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

function createPublicCallLogger(
  supabase: SupabaseClient,
  assistantPublicId: string,
) {
  return {
    async record(log: AiCallLog) {
      const { error } = await supabase.rpc(
        "record_public_assistant_ai_call",
        {
          assistant_public_id: assistantPublicId,
          logged_call_type: log.callType,
          logged_provider: log.provider,
          logged_model: log.model,
          logged_input_tokens: log.inputTokens,
          logged_output_tokens: log.outputTokens,
          logged_total_tokens: log.totalTokens,
          logged_duration_ms: log.durationMs,
          logged_outcome: log.outcome,
          logged_error_type: log.errorType,
          logged_trace_id: log.traceId,
        },
      );

      if (error) {
        throw new Error("无法记录公开助手供应商调用元数据", {
          cause: error,
        });
      }
    },
  };
}
