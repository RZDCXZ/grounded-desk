import { lookup } from "node:dns/promises";
import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import type { LookupFunction } from "node:net";

import { extractWebPage } from "./extract-web-page.ts";
import {
  getLiteralWebAddress,
  isBlockedWebAddress,
  parseWebSourceUrl,
  type ResolvedWebAddress,
} from "./web-address-policy.ts";

export { parseWebSourceUrl } from "./web-address-policy.ts";
export type { ResolvedWebAddress } from "./web-address-policy.ts";

export type WebResponse = {
  status: number;
  headers: Record<string, string | undefined>;
  body: AsyncIterable<Uint8Array>;
  cancel?(): void;
};

export type WebFetchDependencies = {
  allowPrivateAddresses: boolean;
  environment: string;
  timeoutMilliseconds?: number;
  beforeExtract?(): Promise<void>;
  resolveHostname(hostname: string): Promise<ResolvedWebAddress[]>;
  request(input: {
    url: URL;
    address: ResolvedWebAddress;
    signal: AbortSignal;
  }): Promise<WebResponse>;
};

export type WebPageFetchResult =
  | {
      status: "success";
      page: { title: string; body: string; finalUrl: string };
    }
  | {
      status: "failed";
      kind:
        | "invalid-url"
        | "blocked-address"
        | "dns"
        | "redirect"
        | "timeout"
        | "too-large"
        | "unsupported-content-type"
        | "http-status"
        | "invalid-content"
        | "network";
      reason: string;
    };

const MAXIMUM_REDIRECTS = 5;
const MAXIMUM_RESPONSE_BYTES = 1_048_576;

export async function fetchWebKnowledgePage(
  value: string,
  dependencies: WebFetchDependencies,
): Promise<WebPageFetchResult> {
  let url = parseWebSourceUrl(value);

  if (!url) {
    return {
      status: "failed",
      kind: "invalid-url",
      reason: "请输入有效的 HTTP 或 HTTPS 网页地址。",
    };
  }

  const privateAddressesAllowed =
    dependencies.environment === "development" &&
    dependencies.allowPrivateAddresses;
  const signal = AbortSignal.timeout(
    dependencies.timeoutMilliseconds ?? 10_000,
  );

  for (let redirectCount = 0; ; redirectCount += 1) {
    const hostname = url.hostname.replace(/^\[|\]$/gu, "");
    const literalAddress = getLiteralWebAddress(hostname);
    let addresses: ResolvedWebAddress[];

    try {
      addresses = literalAddress
        ? [literalAddress]
        : await abortable(dependencies.resolveHostname(hostname), signal);
    } catch (error) {
      if (isTimeoutFailure(error, signal)) {
        return requestFailure(error, signal);
      }

      return {
        status: "failed",
        kind: "dns",
        reason: "网页地址无法解析，请检查后重试。",
      };
    }

    if (
      !privateAddressesAllowed &&
      addresses.some(isBlockedWebAddress)
    ) {
      return {
        status: "failed",
        kind: "blocked-address",
        reason: "该网页地址指向本机、私网或保留网络，无法导入。",
      };
    }

    const [address] = addresses;

    if (!address) {
      return {
        status: "failed",
        kind: "dns",
        reason: "网页地址无法解析，请检查后重试。",
      };
    }

    let response: WebResponse;

    try {
      response = await dependencies.request({ url, address, signal });
    } catch (error) {
      return requestFailure(error, signal);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      response.cancel?.();
      const location = readHeader(response.headers, "location");

      if (!location || redirectCount >= MAXIMUM_REDIRECTS) {
        return {
          status: "failed",
          kind: "redirect",
          reason: `网页重定向次数超过 ${MAXIMUM_REDIRECTS} 次或目标无效，无法导入。`,
        };
      }

      try {
        const redirectedUrl = new URL(location, url);
        url = parseWebSourceUrl(redirectedUrl.href);

        if (!url) {
          return {
            status: "failed",
            kind: "redirect",
            reason: "网页返回了无效的重定向地址，无法导入。",
          };
        }
      } catch {
        return {
          status: "failed",
          kind: "redirect",
          reason: "网页返回了无效的重定向地址，无法导入。",
        };
      }

      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      response.cancel?.();

      if ([401, 403].includes(response.status)) {
        return {
          status: "failed",
          kind: "http-status",
          reason: `该网页拒绝公开访问（HTTP ${response.status}），系统不会尝试绕过登录、验证码、付费墙或反爬限制。`,
        };
      }

      return {
        status: "failed",
        kind: "http-status",
        reason: `网页返回 HTTP ${response.status}，暂时无法导入。`,
      };
    }

    const contentType = readHeader(response.headers, "content-type") ?? "";

    if (
      !contentType
        .split(";", 1)[0]
        ?.trim()
        .toLowerCase()
        .match(/^text\/html$|^application\/xhtml\+xml$/u)
    ) {
      response.cancel?.();
      return {
        status: "failed",
        kind: "unsupported-content-type",
        reason: "该地址返回的不是 HTML 网页，无法导入。",
      };
    }

    const declaredLength = Number(
      readHeader(response.headers, "content-length") ?? 0,
    );

    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAXIMUM_RESPONSE_BYTES
    ) {
      response.cancel?.();
      return {
        status: "failed",
        kind: "too-large",
        reason: "网页响应超过 1 MB 的导入限制。",
      };
    }

    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    try {
      for await (const chunk of response.body) {
        receivedBytes += chunk.byteLength;

        if (receivedBytes > MAXIMUM_RESPONSE_BYTES) {
          response.cancel?.();
          return {
            status: "failed",
            kind: "too-large",
            reason: "网页响应超过 1 MB 的导入限制。",
          };
        }

        chunks.push(chunk);
      }
    } catch (error) {
      response.cancel?.();
      return requestFailure(error, signal);
    }

    const html = decodeHtml(Buffer.concat(chunks), contentType);
    await dependencies.beforeExtract?.();
    const page = extractWebPage(html, url);

    if (!page.body) {
      return {
        status: "failed",
        kind: "invalid-content",
        reason: "网页中没有可识别的主要正文，无法导入。",
      };
    }

    return { status: "success", page };
  }
}

export function createDefaultWebFetchDependencies(): WebFetchDependencies {
  return {
    environment: process.env.NODE_ENV,
    allowPrivateAddresses:
      process.env.ALLOW_PRIVATE_WEB_SOURCES?.toLowerCase() === "true",
    async resolveHostname(hostname) {
      const addresses = await lookup(hostname, { all: true, verbatim: true });
      return addresses.filter(
        (address): address is ResolvedWebAddress =>
          address.family === 4 || address.family === 6,
      );
    },
    request({ url, address, signal }) {
      return new Promise((resolve, reject) => {
        const send = url.protocol === "https:" ? requestHttps : requestHttp;
        const request = send(
          url,
          {
            agent: false,
            headers: {
              accept: "text/html,application/xhtml+xml",
              "accept-encoding": "identity",
              "user-agent": "GroundedDesk/0.1 Web Knowledge Importer",
            },
            lookup: createPinnedWebLookup(address),
            maxHeaderSize: 16_384,
            method: "GET",
            signal,
          },
          (response) => {
            const headers = Object.fromEntries(
              Object.entries(response.headers).map(([name, value]) => [
                name,
                Array.isArray(value) ? value.join(", ") : value,
              ]),
            );

            resolve({
              status: response.statusCode ?? 0,
              headers,
              body: response,
              cancel() {
                response.destroy();
              },
            });
          },
        );

        request.once("error", reject);
        request.end();
      });
    },
  };
}

export function createPinnedWebLookup(
  address: ResolvedWebAddress,
): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [address]);
      return;
    }

    callback(null, address.address, address.family);
  };
}

function decodeHtml(buffer: Buffer, contentType: string) {
  const charset =
    /charset\s*=\s*["']?([^;"'\s]+)/iu.exec(contentType)?.[1] ?? "utf-8";

  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

function readHeader(
  headers: Record<string, string | undefined>,
  expectedName: string,
) {
  const entry = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === expectedName,
  );
  return entry?.[1];
}

function requestFailure(
  error: unknown,
  signal: AbortSignal,
): WebPageFetchResult {
  return isTimeoutFailure(error, signal)
    ? {
        status: "failed",
        kind: "timeout",
        reason: "网页响应超时，请稍后重试。",
      }
    : {
        status: "failed",
        kind: "network",
        reason: "暂时无法连接该网页，请稍后重试。",
      };
}

function isTimeoutFailure(error: unknown, signal: AbortSignal) {
  const errorName =
    error && typeof error === "object" && "name" in error
      ? String(error.name)
      : "";

  return (
    errorName === "TimeoutError" ||
    (signal.aborted &&
      signal.reason instanceof DOMException &&
      signal.reason.name === "TimeoutError")
  );
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal) {
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }

  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => reject(signal.reason);
    signal.addEventListener("abort", handleAbort, { once: true });

    operation.then(
      (value) => {
        signal.removeEventListener("abort", handleAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", handleAbort);
        reject(error);
      },
    );
  });
}
