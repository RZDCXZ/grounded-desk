import { ConversationDetail } from "../conversation-detail";

export const dynamic = "force-dynamic";

export default async function ConversationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ unresolvedQuestion?: string }>;
}) {
  const { conversationId } = await params;
  const query = await searchParams;

  return (
    <ConversationDetail
      conversationId={conversationId}
      highlightedQuestionId={query.unresolvedQuestion}
      variant="page"
    />
  );
}
