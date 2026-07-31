import {
  getKnowledgeEmbeddingProviderWithMetadata,
} from "../../src/lib/ai/embeddings.ts";
import {
  getEvidenceCoverageProvider,
} from "../../src/lib/ai/evidence-coverage-provider.ts";
import {
  getGroundedAnswerGenerationProvider,
  getGroundedAnswerRerankingProvider,
} from "../../src/lib/ai/grounded-answer-providers.ts";
import {
  ProviderCallError,
  type ProviderCallResult,
} from "../../src/lib/ai/provider-call.ts";
import {
  getRequestAnalysisProvider,
} from "../../src/lib/ai/request-analysis-provider.ts";
import type {
  AiCallLog,
  GroundedAnswerDependencies,
  RetrievedContentUnit,
} from "../../src/lib/assistant/grounded-answer.ts";

import type { DecisionEvaluationCase } from "./dataset.ts";

export type EvaluationMode = "contract" | "live";
export type MutableCallSummary = {
  count: number;
  durationMs: number;
};

export async function createDecisionEvaluationDependencies(
  evaluationCase: DecisionEvaluationCase,
  logs: AiCallLog[],
  mode: EvaluationMode,
  normalizedQuestionSimilarities: number[],
  setupEmbedding: MutableCallSummary,
) {
  const knowledgeByQuestion = evaluationCase.fixture.knowledge;
  const knowledgeInOrder = Object.values(knowledgeByQuestion);
  let embeddingIndex = 0;
  let retrievalIndex = 0;
  const productionEmbedding =
    getKnowledgeEmbeddingProviderWithMetadata();
  const productionRequestAnalysis = getRequestAnalysisProvider();
  const productionReranker =
    getGroundedAnswerRerankingProvider();
  const productionEvidenceCoverage =
    getEvidenceCoverageProvider();
  const productionAnswer = getGroundedAnswerGenerationProvider();
  const analysisFixture = evaluationCase.fixture.analysis;
  const usesFixedAnalysis = mode === "contract" ||
    "failure" in analysisFixture;
  const candidateCorpus = uniqueById(
    knowledgeInOrder.flatMap(({ candidates }) => candidates),
  );
  const setupTexts = [
    ...evaluationCase.annotation.factualRequests.map(
      ({ normalizedQuestion }) => normalizedQuestion,
    ),
    ...candidateCorpus.map(({ content }) => content),
  ];
  const setupEmbeddingResult =
    mode === "live" && setupTexts.length > 0
      ? await productionEmbedding.embed(setupTexts)
      : undefined;
  if (setupEmbeddingResult) {
    setupEmbedding.count += 1;
    setupEmbedding.durationMs += setupEmbeddingResult.durationMs;
  }
  const setupEmbeddings = setupEmbeddingResult?.value ?? [];
  const expectedQuestionEmbeddings = setupEmbeddings.slice(
    0,
    evaluationCase.annotation.factualRequests.length,
  );
  const candidateEmbeddings = new Map(
    candidateCorpus.map((candidate, index) => [
      candidate.id,
      setupEmbeddings[
        evaluationCase.annotation.factualRequests.length + index
      ] ?? [],
    ]),
  );

  return {
    requestAnalysis: {
      provider: usesFixedAnalysis
        ? {
            provider: "decision-evaluation",
            model: "deepseek-v4-flash",
            async analyze() {
              if ("failure" in analysisFixture) {
                if (
                  analysisFixture.failure === "timeout" ||
                  analysisFixture.failure === "network"
                ) {
                  throw providerFailure(
                    evaluationCase.id,
                    "request-analysis",
                    analysisFixture.failure,
                  );
                }
                return providerResult(
                  { unexpected: "field" },
                  evaluationCase.id,
                  "request-analysis-invalid",
                  4,
                );
              }
              return providerResult(
                analysisFixture,
                evaluationCase.id,
                "request-analysis",
                4,
              );
            },
          }
        : productionRequestAnalysis,
      callLogger: logger(logs),
    },
    groundedAnswer: {
      questionEmbeddingProvider: {
        provider: productionEmbedding.provider,
        model: productionEmbedding.model,
        async embed(question: string) {
          const index = embeddingIndex;
          embeddingIndex += 1;
          if (mode === "live") {
            const result = await productionEmbedding.embed([question]);
            const embedding = result.value[0];
            if (!embedding) {
              throw new Error("问题向量服务未返回向量");
            }
            return { ...result, value: embedding };
          }
          return providerResult(
            [index],
            evaluationCase.id,
            `embedding-${index}`,
            2,
          );
        },
      },
      candidateRepository: {
        async retrieve(
          organizationId: string,
          embedding: number[],
          limit: number,
        ) {
          if (mode === "live") {
            const expectedEmbedding =
              expectedQuestionEmbeddings[retrievalIndex];
            normalizedQuestionSimilarities[retrievalIndex] =
              expectedEmbedding
                ? cosineSimilarity(embedding, expectedEmbedding)
                : 0;
            retrievalIndex += 1;
            return candidateCorpus
              .map((item): RetrievedContentUnit => ({
                id: item.id,
                organizationId,
                knowledgeSourceId: item.knowledgeSourceId,
                sourceTitle: item.sourceTitle,
                sourceUrl: item.sourceUrl,
                heading: item.heading,
                content: item.content,
                similarity: cosineSimilarity(
                  embedding,
                  candidateEmbeddings.get(item.id) ?? [],
                ),
              }))
              .sort((left, right) => right.similarity - left.similarity)
              .slice(0, limit);
          }
          const index = Math.max(0, embeddingIndex - 1);
          const knowledge = knowledgeInOrder[index];
          return (knowledge?.candidates ?? [])
            .slice(0, limit)
            .map((item, candidateIndex): RetrievedContentUnit => ({
              id: item.id,
              organizationId,
              knowledgeSourceId: item.knowledgeSourceId,
              sourceTitle: item.sourceTitle,
              sourceUrl: item.sourceUrl,
              heading: item.heading,
              content: item.content,
              similarity: 0.99 - candidateIndex * 0.01,
            }));
        },
      },
      rerankingProvider: mode === "live"
        ? productionReranker
        : {
            provider: "decision-evaluation",
            model: "BAAI/bge-reranker-v2-m3",
            async rerank(
              _question: string,
              candidates: RetrievedContentUnit[],
            ) {
              const scores = new Map(
                knowledgeInOrder.flatMap(
                  ({ candidates: fixtureCandidates }) =>
                    fixtureCandidates.map(({ id, rerankScore }) => [
                      id,
                      rerankScore,
                    ] as const),
                ),
              );
              return providerResult(
                candidates.map(({ id }) => ({
                  contentUnitId: id,
                  score: scores.get(id) ?? 0,
                })),
                evaluationCase.id,
                "rerank",
                3,
              );
            },
          },
      evidenceCoverageProvider: {
        provider: mode === "live"
          ? productionEvidenceCoverage.provider
          : "decision-evaluation",
        model: productionEvidenceCoverage.model,
        async decide(input) {
          const fixture = mode === "live"
            ? knowledgeInOrder.find(({ candidates }) =>
                candidates.some(({ id }) =>
                  input.candidates.some(
                    ({ id: candidateId }) => candidateId === id,
                  )
                )
              ) ??
              (knowledgeInOrder.length === 1
                ? knowledgeInOrder[0]
                : undefined)
            : knowledgeByQuestion[input.normalizedQuestion];
          if (
            mode === "live" &&
            fixture &&
            !("failure" in fixture.coverage)
          ) {
            return productionEvidenceCoverage.decide(input);
          }
          if (!fixture) {
            if (mode === "live") {
              return productionEvidenceCoverage.decide(input);
            }
            return providerResult(
              { status: "unsupported", evidence: [] },
              evaluationCase.id,
              "coverage-empty",
              4,
            );
          }
          if ("failure" in fixture.coverage) {
            if (
              fixture.coverage.failure === "timeout" ||
              fixture.coverage.failure === "network"
            ) {
              throw providerFailure(
                evaluationCase.id,
                "evidence-coverage",
                fixture.coverage.failure,
              );
            }
            if (fixture.coverage.failure === "forged_citation") {
              return providerResult(
                {
                  status: "supported",
                  evidence: [{
                    contentUnitId: "forged-content-unit",
                    relationship: "supports",
                    exactExcerpt: "伪造引用",
                    reason: "伪造的模型关系",
                  }],
                },
                evaluationCase.id,
                "coverage-forged",
                4,
              );
            }
            return providerResult(
              {
                status: "supported",
                evidence: [],
                unexpected: true,
              },
              evaluationCase.id,
              "coverage-invalid",
              4,
            );
          }
          return providerResult(
            fixture.coverage,
            evaluationCase.id,
            "coverage",
            4,
          );
        },
      },
      answerProvider: mode === "live"
        ? productionAnswer
        : {
            provider: "decision-evaluation",
            model: "deepseek-v4-flash",
            streamAnswer(input: {
              evidence: Array<{ exactExcerpt: string }>;
            }) {
              const answer = input.evidence
                .map(({ exactExcerpt }) => exactExcerpt)
                .join(" ");
              return {
                textStream: chunks(answer),
                metadata: Promise.resolve({
                  durationMs: 5,
                  tokens: { input: 1, output: 1, total: 2 },
                  traceId: `${evaluationCase.id}-answer`,
                }),
              };
            },
          },
      callLogger: logger(logs),
      rateLimitRetry: {
        delayMs: 0,
        async wait() {},
      },
      config: {
        candidateLimit: 20,
        evidenceLimit: 5,
        rerankNoiseFloor: 0.05,
      },
    } satisfies GroundedAnswerDependencies,
  };
}

function logger(logs: AiCallLog[]) {
  return {
    async record(log: AiCallLog) {
      logs.push(log);
    },
  };
}

function providerResult<T>(
  value: T,
  caseId: string,
  stage: string,
  durationMs: number,
): ProviderCallResult<T> {
  return {
    value,
    durationMs,
    tokens: { input: 1, output: 1, total: 2 },
    traceId: `${caseId}-${stage}`,
  };
}

function providerFailure(
  caseId: string,
  stage: string,
  errorType: "timeout" | "network",
) {
  return new ProviderCallError(`${stage} failed`, {
    errorType,
    traceId: `${caseId}-${stage}-${errorType}`,
    durationMs: 4,
  });
}

function uniqueById<T extends { id: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function cosineSimilarity(left: number[], right: number[]) {
  if (left.length === 0 || left.length !== right.length) {
    return 0;
  }
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue ** 2;
    rightMagnitude += rightValue ** 2;
  }
  return leftMagnitude > 0 && rightMagnitude > 0
    ? dot / Math.sqrt(leftMagnitude * rightMagnitude)
    : 0;
}

async function* chunks(value: string) {
  const splitAt = Math.max(1, Math.floor(value.length / 2));
  yield value.slice(0, splitAt);
  yield value.slice(splitAt);
}
