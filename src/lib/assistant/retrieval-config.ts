import "server-only";

import {
  readIntegerServerConfig,
  readNumberServerConfig,
} from "../server-config.ts";

export type RetrievalConfig = {
  candidateLimit: number;
  evidenceLimit: number;
  rerankNoiseFloor: number;
};

export function readRetrievalConfig(
  environment: NodeJS.ProcessEnv = process.env,
): RetrievalConfig {
  return {
    candidateLimit: readIntegerServerConfig(
      environment,
      "RETRIEVAL_CANDIDATE_LIMIT",
      20,
      1,
      100,
    ),
    evidenceLimit: readIntegerServerConfig(
      environment,
      "RERANK_EVIDENCE_LIMIT",
      5,
      1,
      20,
    ),
    rerankNoiseFloor: readNumberServerConfig(
      environment,
      "RERANK_NOISE_FLOOR",
      0.05,
      0,
      1,
    ),
  };
}
