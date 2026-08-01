import {
  createPublicConversationResponse,
  type PublicConversationBlocked,
  type PublicConversationStart,
} from "@/lib/assistant/public-conversation";
import { createAssistantResponseConfiguration } from "@/lib/assistant/business-configuration";
import {
  streamReleasedSectionedAssistantResponse,
} from "@/lib/assistant/response-decision-release";
import { selectCompletionProcedure } from "@/lib/assistant/conversation-persistence";
import { createPublicSupabaseGroundedAnswerDependencies } from "@/lib/assistant/supabase-grounded-answer";
import { createPublicSupabaseRequestAnalysisDependencies } from "@/lib/assistant/supabase-request-analysis";
import { readIntegerServerConfig } from "@/lib/server-config";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/privileged";

type PublicConversationRow = {
  request_status:
    | "accepted"
    | PublicConversationBlocked["blockedReason"];
  conversation_id: string | null;
  assistant_message_id: string | null;
  organization_id: string;
  assistant_id: string;
  name: string;
  service_scope: string;
  tone: string;
  human_contact_label: string;
  human_contact_url: string;
  context_messages: PublicConversationStart["context"];
  question_count: number;
  clarification_original_text: string | null;
  clarification_round: 1 | 2 | null;
  clarification_content: string | null;
  clarification_states: Array<{
    originalText: string;
    round: 1 | 2;
    latestClarification: string;
  }> | null;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await context.params;
  const supabase = createPrivilegedSupabaseClient();

  return createPublicConversationResponse(request, publicId, {
    async beginConversation(
      requestedPublicId,
      question,
      conversationId,
      retry,
      usesAi,
    ) {
      const { data, error } = await supabase.rpc(
        "begin_public_conversation_with_clarification_state",
        {
          assistant_public_id: requestedPublicId,
          visitor_question: question,
          requested_conversation_id: conversationId ?? null,
          retry_failed_question: retry ?? false,
          daily_message_budget: readIntegerServerConfig(
            process.env,
            "PUBLIC_DAILY_MESSAGE_BUDGET",
            500,
            1,
            1_000_000,
          ),
          context_message_limit: readIntegerServerConfig(
            process.env,
            "PUBLIC_CONVERSATION_CONTEXT_MESSAGES",
            6,
            6,
            20,
          ),
          request_uses_ai: usesAi ?? true,
        },
      );

      if (error) {
        if (error.code === "P0002" || error.code === "22P02") {
          return null;
        }

        throw new Error("暂时无法创建访客会话", { cause: error });
      }

      const row = (data as PublicConversationRow[] | null)?.[0];
      if (!row) {
        return null;
      }

      const conversation = mapConversation(row, conversationId);
      return conversation;
    },
    streamSectionedAnswer(conversation) {
      const auditContext = {
        conversationId: conversation.conversationId,
        assistantMessageId: conversation.assistantMessageId,
      };
      const analysisInput = {
        organizationId: conversation.organizationId,
        question: conversation.question,
        context: conversation.context,
        clarificationState: conversation.clarificationState,
        clarificationStates: conversation.clarificationStates,
        assistant: conversation.assistant,
        factualRequestId: conversation.factualRequestId,
      };
      const analysisDependencies =
        createPublicSupabaseRequestAnalysisDependencies(
          supabase,
          publicId,
          auditContext,
        );

      return streamReleasedSectionedAssistantResponse(
        analysisInput,
        {
          requestAnalysis: analysisDependencies,
          groundedAnswer:
            createPublicSupabaseGroundedAnswerDependencies(
              supabase,
              publicId,
              auditContext,
            ),
        },
      );
    },
    async completeConversation(conversation, outcome, sections, audit) {
      const procedure = selectCompletionProcedure(outcome.type, audit);
      const { error } = await supabase.rpc(
        procedure,
        {
          assistant_public_id: publicId,
          target_conversation_id: conversation.conversationId,
          result_type: outcome.type,
          result_sections: sections,
          ...(audit && "coverage" in audit
            ? { response_decision: audit }
            : {}),
          ...(audit && "outcome" in audit
            ? { clarification_decision: audit }
            : {}),
          ...(audit && "requests" in audit
            ? { multi_request_decision: audit }
            : {}),
        },
      );

      if (error) {
        throw new Error("暂时无法保存访客会话结果", {
          cause: error,
        });
      }
    },
    async failConversation(conversation) {
      const { error } = await supabase.rpc(
        "fail_public_conversation",
        {
          assistant_public_id: publicId,
          target_conversation_id: conversation.conversationId,
        },
      );

      if (error && error.code !== "P0002") {
        throw new Error("暂时无法保存访客会话故障", {
          cause: error,
        });
      }
    },
  });
}

function mapConversation(
  row: PublicConversationRow,
  requestedConversationId?: string,
): PublicConversationStart | PublicConversationBlocked {
  if (row.request_status !== "accepted") {
    return {
      blockedReason: row.request_status,
      conversationId:
        row.conversation_id ?? requestedConversationId,
      contact: {
        label: row.human_contact_label,
        url: row.human_contact_url,
      },
    };
  }

  if (!row.conversation_id || !row.assistant_message_id) {
    throw new Error("公开会话入口未返回已接受请求的消息标识");
  }

  return {
    conversationId: row.conversation_id,
    assistantMessageId: row.assistant_message_id,
    organizationId: row.organization_id,
    ...(row.clarification_states?.length
      ? {
          clarificationStates: row.clarification_states,
          clarificationState: row.clarification_states[0],
        }
      : {}),
    ...(row.clarification_original_text &&
      row.clarification_round &&
      row.clarification_content &&
      !row.clarification_states?.length
      ? {
          clarificationState: {
            originalText: row.clarification_original_text,
            round: row.clarification_round,
            latestClarification: row.clarification_content,
          },
        }
      : {}),
    context: row.context_messages ?? [],
    assistant: createAssistantResponseConfiguration(row),
  };
}
