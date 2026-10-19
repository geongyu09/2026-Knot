export interface Env {
  /** 정적 파일(빌드한 앱)을 돌려주는 Cloudflare Workers 정적 자산 바인딩 */
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

/** Worker가 받는 중계 경로. wrangler의 `run_worker_first`와 맞춰야 해요 */
export const RELAY_PATH = "/relay";
/**
 * PostHog로 넘기는 하위 경로. `src/index.tsx`의 `api_host`와 맞춰야 해요.
 * Sentry 같은 다른 중계는 `/relay` 아래 다른 하위 경로로 더해요
 */
const POSTHOG_RELAY_PATH = `${RELAY_PATH}/p`;

const POSTHOG_API_HOST = "us.i.posthog.com";
const POSTHOG_ASSET_HOST = "us-assets.i.posthog.com";
// PostHog가 나중에 불러오는 스크립트(녹화 · 설문)와 프로젝트 설정 파일 경로예요. 이 둘만 파일 주소로 가요
const POSTHOG_ASSET_PATH_PREFIXES = ["/static/", "/array/"];

const toPostHogUrl = (url: URL) => {
  const path = url.pathname.slice(POSTHOG_RELAY_PATH.length);
  const host = POSTHOG_ASSET_PATH_PREFIXES.some((prefix) =>
    path.startsWith(prefix),
  )
    ? POSTHOG_ASSET_HOST
    : POSTHOG_API_HOST;

  // 경로를 문자열로 이어 붙이면 `.evil.com/x` 같은 경로가 호스트를 바꿔서, 호스트를 먼저 정하고 경로를 넣어요
  const target = new URL(`https://${host}`);
  target.pathname = path;
  target.search = url.search;

  return target;
};

/**
 * @description 우리 주소의 `/relay/p` 아래로 온 PostHog 요청을 PostHog로 넘기고 응답을 돌려줘요
 * @param request - 브라우저가 보낸 요청. 예: `POST /relay/p/i/v0/e/?ver=…`
 * @returns PostHog 응답의 상태 · 본문 그대로, Set-Cookie만 지운 응답
 * @example
 * if (url.pathname.startsWith("/relay/p/")) return relayToPostHog(request);
 *
 * 우리 쿠키와 인증 헤더는 PostHog로 보내지 않아요. 같은 주소라 브라우저가 우리 쿠키를 함께 실어 보내기 때문이에요.
 * PostHog가 방문자 위치를 Cloudflare 데이터 센터가 아니라 실제 위치로 기록하도록 방문자 IP를 X-Forwarded-For로 넘겨요.
 */
export const relayToPostHog = async (request: Request) => {
  const headers = new Headers(request.headers);
  headers.delete("Cookie");
  headers.delete("Authorization");
  headers.delete("Host");

  const clientIp = request.headers.get("CF-Connecting-IP");
  if (clientIp) headers.set("X-Forwarded-For", clientIp);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstreamResponse = await fetch(
    new Request(toPostHogUrl(new URL(request.url)), {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "follow",
    }),
  );

  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete("Set-Cookie");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
};

/** Sentry로 넘기는 경로. `src/shared/provider/sentry`의 `tunnel`과 맞춰야 해요 */
const SENTRY_RELAY_PATH = `${RELAY_PATH}/s`;

// 우리 Sentry 프로젝트의 수집 주소와 ID예요. 개발 · 운영이 같은 프로젝트를 써요.
// 배포 워크플로가 넣는 저장소 변수 `SENTRY_DSN`과 같은 프로젝트여야 해요. 다르면 모든 envelope가 403이에요
const SENTRY_INGEST_HOST = "o4512278291283968.ingest.us.sentry.io";
const SENTRY_PROJECT_ID = "4512278350069760";
const SENTRY_ENVELOPE_URL = `https://${SENTRY_INGEST_HOST}/api/${SENTRY_PROJECT_ID}/envelope/`;

/** envelope 머리를 찾는 앞부분의 크기. SDK가 만드는 머리는 1KB 안팎이에요 */
const MAX_ENVELOPE_HEADER_BYTES = 64 * 1024;

/** envelope 첫 줄(머리)의 DSN을 꺼내요. 첫 줄이 JSON이 아니거나 DSN이 주소가 아니면 null이에요 */
const readEnvelopeDsn = (body: ArrayBuffer) => {
  // 뒤쪽 항목(리플레이 등)은 압축된 바이트라 첫 줄만 글자로 읽어요. 큰 본문을 끝까지 뒤지지 않게 앞부분에서만 찾아요
  const bytes = new Uint8Array(
    body,
    0,
    Math.min(body.byteLength, MAX_ENVELOPE_HEADER_BYTES),
  );
  const headerEnd = bytes.indexOf("\n".charCodeAt(0));
  const headerLine = new TextDecoder().decode(
    headerEnd === -1 ? bytes : bytes.subarray(0, headerEnd),
  );

  try {
    return new URL(JSON.parse(headerLine).dsn);
  } catch {
    return null;
  }
};

/**
 * @description 우리 주소의 `/relay/s`로 온 Sentry envelope를 우리 Sentry 프로젝트로 넘기고 응답을 돌려줘요
 * @param request - Sentry SDK가 `tunnel`로 보낸 요청. 예: `POST /relay/s`
 * @returns Sentry 응답의 상태 · 본문 그대로, Set-Cookie만 지운 응답
 * @example
 * if (pathname === "/relay/s") return relayToSentry(request);
 *
 * 누구나 이 경로로 보낼 수 있어서, envelope 머리의 DSN이 우리 프로젝트일 때만 넘겨요. 목적지는 DSN에서 만들지 않고 고정해요.
 * 다른 프로젝트면 403, envelope 머리를 앞 64KB 안에서 읽을 수 없으면 400, POST가 아니면 405예요.
 * 요청 헤더는 `Content-Type`만 넘겨요. 같은 주소라 브라우저가 우리 쿠키를 함께 실어 보내고, 방문자 IP를 담은 헤더도 붙어 오기 때문이에요.
 */
export const relayToSentry = async (request: Request) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const body = await request.arrayBuffer();
  const dsn = readEnvelopeDsn(body);
  if (!dsn) return new Response("Bad Request", { status: 400 });

  if (
    dsn.host !== SENTRY_INGEST_HOST ||
    dsn.pathname !== `/${SENTRY_PROJECT_ID}`
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  const headers = new Headers();
  const contentType = request.headers.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);

  const upstreamResponse = await fetch(
    new Request(SENTRY_ENVELOPE_URL, { method: "POST", headers, body }),
  );

  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete("Set-Cookie");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
};

/**
 * @description Worker가 받은 요청을 경로에 따라 PostHog · Sentry 중계 · 404 · 정적 파일로 나눠요
 * @param request - Worker가 받은 요청
 * @param env - Worker 바인딩. 정적 파일은 `env.ASSETS`로 돌려줘요
 * @returns 경로에 맞는 응답
 * @example
 * export default { fetch: handleRequest };
 *
 * wrangler 설정이 `/relay` 아래 요청만 Worker를 먼저 거치게 하고, 나머지 화면 · 파일 주소는 정적 파일로 바로 나가요.
 * `/relay` 아래는 목적지마다 하위 경로로 나눠요. PostHog(`/relay/p` 아래)와 Sentry(`/relay/s` 하나)가 있고, 목적지가 없는 하위 경로는 404예요.
 */
export const handleRequest = (request: Request, env: Env) => {
  const { pathname } = new URL(request.url);

  if (pathname.startsWith(`${POSTHOG_RELAY_PATH}/`)) {
    return relayToPostHog(request);
  }

  if (pathname === SENTRY_RELAY_PATH) return relayToSentry(request);

  if (pathname === RELAY_PATH || pathname.startsWith(`${RELAY_PATH}/`)) {
    return new Response("Not Found", { status: 404 });
  }

  return env.ASSETS.fetch(request);
};
