import {
  ProviderCallError,
  type ProviderCallResult,
} from "../ai/provider-call.ts";
import type { AiCallLog } from "./grounded-answer.ts";

const EVIDENCE_COVERAGE_VERSION = "evidence-coverage-v1";
const MAXIMUM_EVIDENCE_RELATIONSHIPS = 10;
const MAXIMUM_EXCERPT_LENGTH = 2_000;
const MAXIMUM_REASON_LENGTH = 1_000;

export type EvidenceCoverageStatus =
  | "supported"
  | "unsupported"
  | "conflicting";

export type EvidenceCoverageCandidate = {
  id: string;
  organizationId: string;
  knowledgeSourceId: string;
  sourceTitle: string;
  sourceUrl: string | null;
  heading: string | null;
  content: string;
  similarity: number;
  rerankScore: number;
};

export type EvidenceCoverageProviderOutput = {
  status: EvidenceCoverageStatus;
  evidence: Array<{
    contentUnitId: string;
    relationship: "supports" | "conflicts";
    exactExcerpt: string;
    reason: string;
  }>;
};

export type ValidatedEvidenceRelationship =
  EvidenceCoverageProviderOutput["evidence"][number] & {
    knowledgeSourceId: string;
    sourceTitle: string;
    sourceUrl: string | null;
  };

export type EvidenceCoverageDecision = {
  version: typeof EVIDENCE_COVERAGE_VERSION;
  factualRequestId: string;
  status: EvidenceCoverageStatus;
  evidence: ValidatedEvidenceRelationship[];
};

export type EvidenceCoverageInput = {
  organizationId: string;
  factualRequestId: string;
  normalizedQuestion: string;
  candidates: EvidenceCoverageCandidate[];
};

export type EvidenceCoverageDependencies = {
  provider: {
    provider: string;
    model: string;
    decide(input: EvidenceCoverageInput): Promise<ProviderCallResult<unknown>>;
  };
  callLogger: {
    record(log: AiCallLog): Promise<void>;
  };
};

export async function decideEvidenceCoverage(
  input: EvidenceCoverageInput,
  dependencies: EvidenceCoverageDependencies,
): Promise<EvidenceCoverageDecision> {
  const eligibleCandidates = input.candidates.filter(
    ({ organizationId }) => organizationId === input.organizationId,
  );
  const providerInput = {
    ...input,
    candidates: eligibleCandidates,
  };
  let finalError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let result: ProviderCallResult<unknown>;
    let decision: EvidenceCoverageDecision | null;

    try {
      result = await dependencies.provider.decide(providerInput);
      decision = validateCoverageDecision(providerInput, result.value);
      if (!decision) {
        throw new ProviderCallError("证据覆盖服务返回无效结果", {
          errorType: "invalid_response",
          traceId: result.traceId,
          durationMs: result.durationMs,
          tokens: result.tokens,
        });
      }
    } catch (error) {
      finalError = error;
      await recordFailedCoverageCall(
        input.organizationId,
        dependencies,
        error,
      );
      continue;
    }

    try {
      await dependencies.callLogger.record({
        organizationId: input.organizationId,
        callType: "evidence_coverage",
        provider: dependencies.provider.provider,
        model: dependencies.provider.model,
        inputTokens: result.tokens.input,
        outputTokens: result.tokens.output,
        totalTokens: result.tokens.total,
        durationMs: result.durationMs,
        outcome: "success",
        errorType: null,
        traceId: result.traceId,
      });
    } catch (error) {
      throw new Error("无法记录证据覆盖调用元数据", {
        cause: error,
      });
    }

    return decision;
  }

  throw finalError;
}

function validateCoverageDecision(
  input: EvidenceCoverageInput,
  value: unknown,
): EvidenceCoverageDecision | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["status", "evidence"]) ||
    !isCoverageStatus(value.status) ||
    !Array.isArray(value.evidence) ||
    value.evidence.length > MAXIMUM_EVIDENCE_RELATIONSHIPS
  ) {
    return null;
  }

  const candidatesById = new Map(
    input.candidates.map((item) => [item.id, item]),
  );
  if (candidatesById.size !== input.candidates.length) {
    return null;
  }

  const evidence = value.evidence.flatMap((relationship) => {
    if (
      !isRecord(relationship) ||
      !hasExactKeys(relationship, [
        "contentUnitId",
        "relationship",
        "exactExcerpt",
        "reason",
      ]) ||
      typeof relationship.contentUnitId !== "string" ||
      (
        relationship.relationship !== "supports" &&
        relationship.relationship !== "conflicts"
      ) ||
      !isBoundedText(
        relationship.exactExcerpt,
        MAXIMUM_EXCERPT_LENGTH,
      ) ||
      !isBoundedText(relationship.reason, MAXIMUM_REASON_LENGTH)
    ) {
      return [];
    }

    const candidate = candidatesById.get(relationship.contentUnitId);
    if (
      !candidate ||
      candidate.organizationId !== input.organizationId ||
      !normalizedText(candidate.content).includes(
        normalizedText(relationship.exactExcerpt as string),
      )
    ) {
      return [];
    }

    return [{
      contentUnitId: relationship.contentUnitId,
      knowledgeSourceId: candidate.knowledgeSourceId,
      sourceTitle: candidate.sourceTitle,
      sourceUrl: candidate.sourceUrl,
      relationship: relationship.relationship as
        | "supports"
        | "conflicts",
      exactExcerpt: relationship.exactExcerpt as string,
      reason: relationship.reason as string,
    }];
  });

  if (evidence.length !== value.evidence.length) {
    return null;
  }

  const relationshipKeys = new Set(
    evidence.map(({ contentUnitId, relationship }) =>
      `${contentUnitId}:${relationship}`
    ),
  );
  if (relationshipKeys.size !== evidence.length) {
    return null;
  }

  if (
    (
      value.status === "supported" &&
      (
        evidence.length === 0 ||
        evidence.some(
          ({ relationship }) => relationship !== "supports",
        )
      )
    ) ||
    (value.status === "unsupported" && evidence.length !== 0) ||
    (
      value.status === "conflicting" &&
      (
        evidence.length < 2 ||
        evidence.some(
          ({ relationship }) => relationship !== "conflicts",
        ) ||
        new Set(evidence.map(({ contentUnitId }) => contentUnitId))
            .size < 2
      )
    )
  ) {
    return null;
  }

  return {
    version: EVIDENCE_COVERAGE_VERSION,
    factualRequestId: input.factualRequestId,
    status: value.status,
    evidence,
  };
}

function createFailedCoverageLog(
  organizationId: string,
  dependencies: EvidenceCoverageDependencies,
  error: unknown,
): AiCallLog {
  const metadata =
    error instanceof ProviderCallError
      ? error
      : {
          durationMs: 0,
          errorType: "unknown" as const,
          tokens: { input: 0, output: 0, total: 0 },
          traceId: crypto.randomUUID(),
        };

  return {
    organizationId,
    callType: "evidence_coverage",
    provider: dependencies.provider.provider,
    model: dependencies.provider.model,
    inputTokens: metadata.tokens.input,
    outputTokens: metadata.tokens.output,
    totalTokens: metadata.tokens.total,
    durationMs: metadata.durationMs,
    outcome: "error",
    errorType: metadata.errorType,
    traceId: metadata.traceId,
  };
}

async function recordFailedCoverageCall(
  organizationId: string,
  dependencies: EvidenceCoverageDependencies,
  error: unknown,
) {
  try {
    await dependencies.callLogger.record(
      createFailedCoverageLog(organizationId, dependencies, error),
    );
  } catch {
    // The provider error remains authoritative for retry and diagnosis.
  }
}

function normalizedText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: string[],
) {
  const expected = new Set(keys);
  return (
    Object.keys(value).length === expected.size &&
    Object.keys(value).every((key) => expected.has(key))
  );
}

function isCoverageStatus(
  value: unknown,
): value is EvidenceCoverageStatus {
  return (
    value === "supported" ||
    value === "unsupported" ||
    value === "conflicting"
  );
}

function isBoundedText(value: unknown, maximumLength: number) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximumLength
  );
}
