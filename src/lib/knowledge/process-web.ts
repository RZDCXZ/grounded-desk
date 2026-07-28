import type { WebPageFetchResult } from "./fetch-web-page.ts";
import {
  processKnowledgeRevision,
  type KnowledgeProcessingDependencies,
  type KnowledgeProcessingResult,
  type KnowledgeRevision,
} from "./process-revision.ts";

export type WebKnowledgeRevision = {
  id: string;
  originalUrl: string;
};

type WebKnowledgeProcessingDependencies =
  KnowledgeProcessingDependencies & {
    fetchPage(url: string): Promise<WebPageFetchResult>;
    prepareRevision(revision: KnowledgeRevision): Promise<void>;
  };

export async function processWebKnowledgeRevision(
  revision: WebKnowledgeRevision,
  dependencies: WebKnowledgeProcessingDependencies,
): Promise<KnowledgeProcessingResult> {
  const fetched = await dependencies.fetchPage(revision.originalUrl);

  if (fetched.status === "failed") {
    await dependencies.revisionRepository.fail(revision.id, fetched.reason);
    return { status: "failed", reason: fetched.reason };
  }

  const preparedRevision = {
    id: revision.id,
    title: fetched.page.title,
    body: fetched.page.body,
  };

  try {
    await dependencies.prepareRevision(preparedRevision);
  } catch {
    const reason = "网页内容暂时无法保存，请稍后重试。";
    await dependencies.revisionRepository.fail(revision.id, reason);
    return { status: "failed", reason };
  }

  return processKnowledgeRevision(preparedRevision, dependencies);
}
