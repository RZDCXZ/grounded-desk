export type QualityFeedbackValue = "helpful" | "unhelpful";

type QualityFeedbackSubmission = {
  feedbackId: string;
  unresolvedQuestionId: string | null;
};

type PublicQualityFeedbackDependencies = {
  submitFeedback(
    publicId: string,
    answerMessageId: string,
    value: QualityFeedbackValue,
  ): Promise<QualityFeedbackSubmission | null>;
};

export async function createPublicQualityFeedbackResponse(
  request: Request,
  publicId: string,
  answerMessageId: string,
  dependencies: PublicQualityFeedbackDependencies,
) {
  const value = await readQualityFeedbackValue(request);

  if (!value) {
    return Response.json(
      { message: "请选择“有帮助”或“没帮助”。" },
      {
        status: 400,
        headers: { "cache-control": "no-store" },
      },
    );
  }

  const submission = await dependencies.submitFeedback(
    publicId,
    answerMessageId,
    value,
  );

  if (!submission) {
    return Response.json(
      { message: "这条助手回答不存在或尚未完成。" },
      {
        status: 404,
        headers: { "cache-control": "no-store" },
      },
    );
  }

  return Response.json(
    {
      feedbackValue: value,
      unresolvedQuestionId: submission.unresolvedQuestionId,
    },
    {
      headers: { "cache-control": "no-store" },
    },
  );
}

async function readQualityFeedbackValue(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return null;
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("value" in payload)
  ) {
    return null;
  }

  return payload.value === "helpful" || payload.value === "unhelpful"
    ? payload.value
    : null;
}
