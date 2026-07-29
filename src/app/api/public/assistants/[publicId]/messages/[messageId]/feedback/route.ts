import {
  createPublicQualityFeedbackResponse,
  type QualityFeedbackValue,
} from "@/lib/assistant/quality-feedback";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/privileged";

type QualityFeedbackRow = {
  quality_feedback_id: string;
  unresolved_question_id: string | null;
  feedback_value: QualityFeedbackValue;
};

export async function PUT(
  request: Request,
  context: {
    params: Promise<{ publicId: string; messageId: string }>;
  },
) {
  const { messageId, publicId } = await context.params;
  const supabase = createPrivilegedSupabaseClient();

  return createPublicQualityFeedbackResponse(
    request,
    publicId,
    messageId,
    {
      async submitFeedback(
        requestedPublicId,
        answerMessageId,
        value,
      ) {
        const { data, error } = await supabase.rpc(
          "submit_public_quality_feedback",
          {
            assistant_public_id: requestedPublicId,
            target_answer_message_id: answerMessageId,
            submitted_feedback_value: value,
          },
        );

        if (error) {
          if (error.code === "22023" || error.code === "22P02") {
            return null;
          }

          throw new Error("暂时无法保存质量反馈", { cause: error });
        }

        const row = (data as QualityFeedbackRow[] | null)?.[0];

        return row
          ? {
              feedbackId: row.quality_feedback_id,
              unresolvedQuestionId: row.unresolved_question_id,
            }
          : null;
      },
    },
  );
}
