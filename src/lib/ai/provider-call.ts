export type ProviderTokens = {
  input: number;
  output: number;
  total: number;
};

export type ProviderCallResult<T> = {
  value: T;
  durationMs: number;
  tokens: ProviderTokens;
  traceId: string;
};

export type ProviderCallMetadata = Omit<ProviderCallResult<never>, "value">;

export type ProviderErrorType =
  | "configuration"
  | "timeout"
  | "network"
  | "rate_limit"
  | "input_rejected"
  | "provider_http"
  | "invalid_response"
  | "unknown";

export class ProviderCallError extends Error {
  readonly errorType: ProviderErrorType;
  readonly traceId: string;
  readonly durationMs: number;
  readonly tokens: ProviderTokens;

  constructor(
    message: string,
    metadata: {
      errorType: ProviderErrorType;
      traceId: string;
      durationMs: number;
      tokens?: ProviderTokens;
    },
  ) {
    super(message);
    this.name = "ProviderCallError";
    this.errorType = metadata.errorType;
    this.traceId = metadata.traceId;
    this.durationMs = metadata.durationMs;
    this.tokens = metadata.tokens ?? { input: 0, output: 0, total: 0 };
  }
}

export function safeTokenCount(value: number | undefined) {
  return Number.isInteger(value) && (value ?? -1) >= 0 ? (value ?? 0) : 0;
}

export function elapsedMilliseconds(startedAt: number) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

export function createProviderCallError(
  message: string,
  errorType: ProviderErrorType,
  traceId: string,
  startedAt: number,
) {
  return new ProviderCallError(message, {
    errorType,
    traceId,
    durationMs: elapsedMilliseconds(startedAt),
  });
}

export function createProviderRequestError(
  message: string,
  error: unknown,
  traceId: string,
  startedAt: number,
  errorType: ProviderErrorType =
    error instanceof DOMException && error.name === "TimeoutError"
      ? "timeout"
      : "network",
) {
  if (error instanceof ProviderCallError) {
    return error;
  }

  return createProviderCallError(
    message,
    errorType,
    traceId,
    startedAt,
  );
}
