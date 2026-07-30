import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getKnowledgeEmbeddingProviderWithMetadata } from "../ai/embeddings.ts";
import {
  getGroundedAnswerGenerationProvider,
  getGroundedAnswerRerankingProvider,
} from "../ai/grounded-answer-providers.ts";
import { getEvidenceCoverageProvider } from "../ai/evidence-coverage-provider.ts";
import { readIntegerServerConfig } from "../server-config.ts";
import type {
  AiCallLog,
  RetrievedContentUnit,
} from "./grounded-answer.ts";
import { readRetrievalConfig } from "./retrieval-config.ts";

type RetrievedContentUnitRow = {
  content_unit_id: string;
  knowledge_source_id: string;
  source_title: string;
  source_url: string | null;
  heading: string | null;
  content: string;
  similarity: number;
};

export type AiCallAuditContext = {
  conversationId: string;
  assistantMessageId: string;
};

export function createSupabaseGroundedAnswerDependencies(
  supabase: SupabaseClient,
  auditContext?: AiCallAuditContext,
) {
  return createConfiguredDependencies(
    createCandidateRepository(supabase),
    createSupabaseCallLogger(supabase, auditContext),
  );
}

export function createPublicSupabaseGroundedAnswerDependencies(
  supabase: SupabaseClient,
  assistantPublicId: string,
  auditContext?: AiCallAuditContext,
) {
  return createConfiguredDependencies(
    createPublicCandidateRepository(supabase, assistantPublicId),
    createPublicSupabaseCallLogger(
      supabase,
      assistantPublicId,
      auditContext,
    ),
  );
}

function createConfiguredDependencies(
  candidateRepository: ReturnType<typeof createCandidateRepository>,
  callLogger: ReturnType<typeof createSupabaseCallLogger>,
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
    evidenceCoverageProvider: getEvidenceCoverageProvider(),
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
      organizationId: string,
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
        organizationId,
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
      organizationId: string,
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
        organizationId,
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

export function createSupabaseCallLogger(
  supabase: SupabaseClient,
  auditContext?: AiCallAuditContext,
) {
  return {
    async record(log: AiCallLog) {
      const { error } = await supabase.from("ai_call_logs").insert({
        organization_id: log.organizationId,
        conversation_id: auditContext?.conversationId ?? null,
        assistant_message_id:
          auditContext?.assistantMessageId ?? null,
        factual_request_id: auditContext
          ? log.factualRequestId ?? null
          : null,
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

export function createPublicSupabaseCallLogger(
  supabase: SupabaseClient,
  assistantPublicId: string,
  auditContext?: AiCallAuditContext,
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
          target_conversation_id:
            auditContext?.conversationId ?? null,
          target_assistant_message_id:
            auditContext?.assistantMessageId ?? null,
          target_factual_request_id:
            log.factualRequestId ?? null,
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
