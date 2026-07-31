import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import type {
  DecisionEvaluationCase,
  ExpectedEvaluationResult,
} from "./dataset.ts";

export const LEGACY_RESPONSE_DECISION_SOURCE = {
  commit: "9d5010b",
  strategyVersion: "fixed-routing-threshold-v1",
  captureMethod: "executed_historical_preview_modules",
  blobs: {
    administratorPreview:
      "22eb04c4f159dda96b1922fea900691ca1f40ac1",
    conversationalRouting:
      "146a3cf6dd17670872cbf530b03bdf9e9aa2c85d",
    clarification:
      "83a9a9e274471c80a689ca01015130ece7119808",
    groundedAnswer:
      "c783bbb1b091d9b6f6e2ec3e77c7c17110846517",
    retrievalConfig:
      "06228de3e2911584abce9353037dd55ac7dd636e",
    questionLanguage:
      "56980c8d61dc37ac856b30befcd0851109917392",
    businessConfiguration:
      "26deaecd5cd6771376dd782b86609c0fa54006e0",
    conversationResult:
      "5e9c7629226ab8c93277c17acd26c2e423a0f7ed",
    providerCall:
      "2ee29aa451b8dbea84c6127b771698cd20e7754f",
  },
} as const;

const projectDirectory = fileURLToPath(
  new URL("../..", import.meta.url),
);
const execFileAsync = promisify(execFile);
const legacyFiles = {
  administratorPreview:
    "src/app/api/admin/assistant/preview/route.ts",
  conversationalRouting:
    "src/lib/assistant/conversational-response.ts",
  clarification:
    "src/lib/assistant/clarification-request.ts",
  groundedAnswer: "src/lib/assistant/grounded-answer.ts",
  retrievalConfig: "src/lib/assistant/retrieval-config.ts",
  questionLanguage: "src/lib/assistant/question-language.ts",
  businessConfiguration:
    "src/lib/assistant/business-configuration.ts",
  conversationResult: "src/lib/assistant/conversation-result.ts",
  providerCall: "src/lib/ai/provider-call.ts",
} as const;

type LegacyModules = {
  routeConversationInput(question: string):
    | { type: "conversational_response"; category: string }
    | { type: "knowledge" };
  streamRoutedAssistantResponse(input: {
    question: string;
    route: ReturnType<LegacyModules["routeConversationInput"]>;
    assistant: LegacyAssistant;
    streamKnowledgeAnswer(): AsyncIterable<LegacyEvent>;
  }): AsyncIterable<LegacyEvent>;
  streamGroundedAnswer(
    input: {
      organizationId: string;
      question: string;
      context: Array<{
        role: "visitor" | "assistant";
        content: string;
        resultType?: string;
      }>;
      assistant: LegacyAssistant;
    },
    dependencies: Record<string, unknown>,
  ): AsyncIterable<LegacyEvent>;
};

type LegacyEvent = {
  type: string;
  resultType?: ExpectedEvaluationResult;
};

type LegacyAssistant = {
  name: string;
  serviceScope: string;
  tone: string;
  humanContactLabel: string;
  humanContactUrl: string;
};

let legacyModulesPromise: Promise<LegacyModules> | undefined;

export async function runLegacyPreviewBaseline(
  cases: DecisionEvaluationCase[],
) {
  const modules = await loadLegacyModules();
  return new Map(
    await Promise.all(
      cases.map(async (evaluationCase) => [
        evaluationCase.id,
        await runLegacyCase(modules, evaluationCase),
      ] as const),
    ),
  );
}

export async function verifyLegacyResponseDecisionSource() {
  await loadLegacyModules();
}

async function loadLegacyModules() {
  legacyModulesPromise ??= materializeLegacyModules();
  return legacyModulesPromise;
}

async function materializeLegacyModules(): Promise<LegacyModules> {
  const directory = await mkdtemp(
    join(projectDirectory, ".legacy-decision-"),
  );
  try {
    for (const [name, path] of Object.entries(legacyFiles)) {
      const [{ stdout: hash }, { stdout: source }] =
        await Promise.all([
          execFileAsync(
            "git",
            [
              "rev-parse",
              `${LEGACY_RESPONSE_DECISION_SOURCE.commit}:${path}`,
            ],
            { cwd: projectDirectory },
          ),
          execFileAsync(
            "git",
            [
              "show",
              `${LEGACY_RESPONSE_DECISION_SOURCE.commit}:${path}`,
            ],
            {
              cwd: projectDirectory,
              encoding: "buffer",
              maxBuffer: 2_000_000,
            },
          ),
        ]);
      const expected =
        LEGACY_RESPONSE_DECISION_SOURCE.blobs[
          name as keyof typeof LEGACY_RESPONSE_DECISION_SOURCE.blobs
        ];
      if (String(hash).trim() !== expected) {
        throw new Error(`历史决策源 ${name} 的 blob 与固定基线不一致`);
      }
      const destination = join(directory, path);
      await mkdir(join(destination, ".."), { recursive: true });
      await writeFile(destination, source);
    }

    const conversational = await import(
      pathToFileURL(
        join(
          directory,
          legacyFiles.conversationalRouting,
        ),
      ).href
    );
    const grounded = await import(
      pathToFileURL(
        join(directory, legacyFiles.groundedAnswer),
      ).href
    );
    return {
      routeConversationInput:
        conversational.routeConversationInput,
      streamRoutedAssistantResponse:
        conversational.streamRoutedAssistantResponse,
      streamGroundedAnswer: grounded.streamGroundedAnswer,
    } as LegacyModules;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function runLegacyCase(
  modules: LegacyModules,
  evaluationCase: DecisionEvaluationCase,
) {
  const assistant: LegacyAssistant = {
    name: evaluationCase.annotation.language === "en"
      ? "Northstar Studio Advisor"
      : "北辰工作室顾问",
    serviceScope: "Northstar Studio demonstration services",
    tone: "professional",
    humanContactLabel: "Contact support",
    humanContactUrl: "mailto:hello@example.test",
  };
  const candidates = [
    ...new Map(
      Object.values(evaluationCase.fixture.knowledge)
        .flatMap(({ candidates: items }) => items)
        .map((candidate) => [candidate.id, candidate]),
    ).values(),
  ];
  const route = modules.routeConversationInput(evaluationCase.question);
  const context = (evaluationCase.clarificationStates ?? []).flatMap(
    (state) => [
      { role: "visitor" as const, content: state.originalText },
      {
        role: "assistant" as const,
        content: state.latestClarification,
        resultType: "clarification_request",
      },
    ],
  );
  const stream = modules.streamRoutedAssistantResponse({
    question: evaluationCase.question,
    route,
    assistant,
    streamKnowledgeAnswer: () =>
      modules.streamGroundedAnswer(
        {
          organizationId: "legacy-decision-evaluation",
          question: evaluationCase.question,
          context,
          assistant,
        },
        legacyDependencies(evaluationCase.id, candidates),
      ),
  });
  let result: ExpectedEvaluationResult | undefined;
  for await (const event of stream) {
    result = event.resultType ?? result;
  }
  if (!result) {
    throw new Error(`历史预览用例 ${evaluationCase.id} 未形成结果`);
  }
  return result;
}

function legacyDependencies(
  caseId: string,
  candidates: DecisionEvaluationCase["fixture"]["knowledge"][string]["candidates"],
) {
  const providerResult = <T>(value: T, stage: string) => ({
    value,
    durationMs: 1,
    tokens: { input: 1, output: 1, total: 2 },
    traceId: `${caseId}-legacy-${stage}`,
  });
  return {
    questionEmbeddingProvider: {
      provider: "historical-fixture",
      model: "historical-fixture",
      async embed() {
        return providerResult([1], "embedding");
      },
    },
    candidateRepository: {
      async retrieve(_organizationId: string, _embedding: number[], limit: number) {
        return candidates.slice(0, limit).map((candidate, index) => ({
          ...candidate,
          similarity: 0.99 - index * 0.01,
        }));
      },
    },
    rerankingProvider: {
      provider: "historical-fixture",
      model: "historical-fixture",
      async rerank() {
        return providerResult(
          candidates.map(({ id, rerankScore }) => ({
            contentUnitId: id,
            score: rerankScore,
          })),
          "rerank",
        );
      },
    },
    answerProvider: {
      provider: "historical-fixture",
      model: "historical-fixture",
      streamAnswer(input: {
        evidence: Array<{ content: string }>;
      }) {
        return {
          textStream: (async function* () {
            yield input.evidence.map(({ content }) => content).join(" ");
          })(),
          metadata: Promise.resolve(
            providerResult(undefined, "answer"),
          ),
        };
      },
    },
    callLogger: { async record() {} },
    rateLimitRetry: { delayMs: 0, async wait() {} },
    config: {
      candidateLimit: 20,
      evidenceLimit: 5,
      evidenceThreshold: 0.5,
    },
  };
}
