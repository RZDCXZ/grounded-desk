import { streamGroundedAnswer } from "@/lib/assistant/grounded-answer";
import {
  createPublicConversationResponse,
  type PublicConversationBlocked,
  type PublicConversationStart,
} from "@/lib/assistant/public-conversation";
import { createPublicSupabaseGroundedAnswerDependencies } from "@/lib/assistant/supabase-grounded-answer";
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
        "begin_public_conversation",
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
            2,
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
      return row ? mapConversation(row, conversationId) : null;
    },
    streamAnswer(conversation) {
      return streamGroundedAnswer(
        {
          organizationId: conversation.organizationId,
          question: conversation.question,
          context: conversation.context,
          assistant: conversation.assistant,
        },
        createPublicSupabaseGroundedAnswerDependencies(
          supabase,
          publicId,
        ),
      );
    },
    async completeConversation(conversation, outcome) {
      const { error } = await supabase.rpc(
        "complete_public_conversation",
        {
          assistant_public_id: publicId,
          target_conversation_id: conversation.conversationId,
          result_type: outcome.type,
          result_content: outcome.content,
          result_citations: outcome.citations,
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
    context: row.context_messages ?? [],
    assistant: {
      name: row.name,
      serviceScope: row.service_scope,
      tone: row.tone,
      humanContactLabel: row.human_contact_label,
      humanContactUrl: row.human_contact_url,
    },
  };
}
