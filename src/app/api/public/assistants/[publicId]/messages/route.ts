import { streamGroundedAnswer } from "@/lib/assistant/grounded-answer";
import {
  createPublicConversationResponse,
  type PublicConversationStart,
} from "@/lib/assistant/public-conversation";
import { createPublicSupabaseGroundedAnswerDependencies } from "@/lib/assistant/supabase-grounded-answer";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/privileged";

type PublicConversationRow = {
  conversation_id: string;
  assistant_message_id: string;
  organization_id: string;
  assistant_id: string;
  name: string;
  service_scope: string;
  tone: string;
  human_contact_label: string;
  human_contact_url: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await context.params;
  const supabase = createPrivilegedSupabaseClient();

  return createPublicConversationResponse(request, publicId, {
    async beginConversation(requestedPublicId, question) {
      const { data, error } = await supabase.rpc(
        "begin_public_conversation",
        {
          assistant_public_id: requestedPublicId,
          visitor_question: question,
        },
      );

      if (error) {
        if (error.code === "P0002" || error.code === "22P02") {
          return null;
        }

        throw new Error("暂时无法创建访客会话", { cause: error });
      }

      const row = (data as PublicConversationRow[] | null)?.[0];
      return row ? mapConversation(row) : null;
    },
    streamAnswer(conversation) {
      return streamGroundedAnswer(
        {
          organizationId: conversation.organizationId,
          question: conversation.question,
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
): PublicConversationStart {
  return {
    conversationId: row.conversation_id,
    assistantMessageId: row.assistant_message_id,
    organizationId: row.organization_id,
    assistant: {
      name: row.name,
      serviceScope: row.service_scope,
      tone: row.tone,
      humanContactLabel: row.human_contact_label,
      humanContactUrl: row.human_contact_url,
    },
  };
}
