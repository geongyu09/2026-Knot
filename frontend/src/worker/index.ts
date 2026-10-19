interface Env {
  /** 정적 파일(빌드한 앱)을 돌려주는 Cloudflare Workers 정적 자산 바인딩 */
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

type FetchUpstream = (request: Request) => Promise<Response>;

/** Worker가 받는 중계 경로. wrangler의 `run_worker_first`와 맞춰야 해요 */
export const RELAY_PATH = "/relay";
/** PostHog로 넘기는 하위 경로. Sentry 같은 다른 중계는 `/relay` 아래 다른 하위 경로로 더해요 */
const POSTHOG_RELAY_PATH = `${RELAY_PATH}/p`;

const POSTHOG_API_HOST = "us.i.posthog.com";
const POSTHOG_ASSET_HOST = "us-assets.i.posthog.com";
// PostHog가 나중에 불러오는 스크립트(녹화 · 설문)와 프로젝트 설정 파일 경로예요. 이 둘만 파일 주소로 가요
const POSTHOG_ASSET_PATH_PREFIXES = ["/static/", "/array/"];

const toPostHogUrl = (url: URL) => {
  const path = url.pathname.slice(POSTHOG_RELAY_PATH.length) || "/";
  const host = POSTHOG_ASSET_PATH_PREFIXES.some((prefix) =>
    path.startsWith(prefix),
  )
    ? POSTHOG_ASSET_HOST
    : POSTHOG_API_HOST;

  return `https://${host}${path}${url.search}`;
};

/**
 * @description 우리 주소의 `/relay/p` 아래로 온 PostHog 요청을 PostHog로 넘기고 응답을 돌려줘요
 * @param request - 브라우저가 보낸 요청. 예: `POST /relay/p/i/v0/e/?ver=…`
 * @param fetchUpstream - PostHog로 요청을 보내는 함수. 테스트에서만 넘겨요
 * @returns PostHog 응답의 상태 · 본문 그대로, Set-Cookie만 지운 응답
 * @example
 * if (url.pathname.startsWith("/relay/p/")) return relayToPostHog(request);
 *
 * 우리 쿠키와 인증 헤더는 PostHog로 보내지 않아요. 같은 주소라 브라우저가 우리 쿠키를 함께 실어 보내기 때문이에요.
 * PostHog가 방문자 위치를 Cloudflare 데이터 센터가 아니라 실제 위치로 기록하도록 방문자 IP를 X-Forwarded-For로 넘겨요.
 */
export const relayToPostHog = async (
  request: Request,
  fetchUpstream: FetchUpstream = fetch,
) => {
  const headers = new Headers(request.headers);
  headers.delete("Cookie");
  headers.delete("Authorization");
  headers.delete("Host");

  const clientIp = request.headers.get("CF-Connecting-IP");
  if (clientIp) headers.set("X-Forwarded-For", clientIp);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstreamResponse = await fetchUpstream(
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

/**
 * 프론트 Cloudflare Worker의 진입점이에요(ADR 838).
 *
 * wrangler 설정이 `/relay` 아래 요청만 이 코드를 먼저 거치게 하고, 나머지 화면 · 파일 주소는 정적 파일로 바로 나가요.
 * `/relay` 아래는 목적지마다 하위 경로로 나눠요. 지금은 PostHog(`/relay/p`)만 있고, 목적지가 없는 하위 경로는 404예요.
 */
export default {
  fetch: (request: Request, env: Env) => {
    const { pathname } = new URL(request.url);

    if (pathname.startsWith(`${POSTHOG_RELAY_PATH}/`)) {
      return relayToPostHog(request);
    }

    if (pathname === RELAY_PATH || pathname.startsWith(`${RELAY_PATH}/`)) {
      return new Response("Not Found", { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
};
