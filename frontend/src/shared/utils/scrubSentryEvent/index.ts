import type { BrowserOptions, Breadcrumb, ErrorEvent } from "@sentry/react";

/** Sentry가 보내기 전에 `beforeSendSpan`으로 넘겨주는 span 하나. SDK가 타입을 따로 내보내지 않아 옵션에서 꺼내요 */
export type StreamedSpan = Parameters<
  NonNullable<BrowserOptions["beforeSendSpan"]>
>[0];

/**
 * 비밀 값이 경로에 들어가는 주소. 화면의 초대 링크(`/invite/:token`)와 초대 판정 API(`/api/v1/invitations/:tokenOrCode`)예요.
 */
const SECRET_PATH_PATTERN = /(\/invite|\/api\/v1\/invitations)\/[^/?#]+/g;

/**
 * 글 안에서 경로(`/`가 든 낱말) 뒤에 붙은 쿼리 파라미터와 해시.
 * `/`가 없는 낱말의 `#`(요소 선택자 `div#root`)은 건드리지 않아요
 */
const QUERY_AFTER_PATH_PATTERN = /(\/[^\s?#]*)[?#]\S*/g;

/** 쿼리 파라미터나 해시만 담는 span 속성. 값에 경로가 없어 통째로 지워요 */
const QUERY_SPAN_ATTRIBUTE_KEYS = [
  "url.query",
  "url.fragment",
  "http.query",
  "http.fragment",
];

/** 요청 헤더 중 남기는 것. 쿠키 · 인증 · CSRF 헤더는 남기지 않아요 */
const KEPT_HEADER_NAMES = ["user-agent", "referer"];

/** fetch · xhr 기록 중 남기는 값. 요청 · 응답 본문은 남기지 않아요 */
const KEPT_HTTP_BREADCRUMB_KEYS = ["method", "url", "status_code"];

/** 주소에서 쿼리 파라미터와 해시를 지우고 경로의 초대 토큰을 가려요 */
export const scrubUrl = (url: string) =>
  url.split(/[?#]/)[0].replace(SECRET_PATH_PATTERN, "$1/[token]");

const scrubUrlValue = (value: unknown) =>
  typeof value === "string" ? scrubUrl(value) : value;

/**
 * 주소가 섞인 글(`GET https://…?x=1`)에서 주소의 쿼리 파라미터 · 해시를 지우고 초대 토큰을 가려요.
 * 주소가 아닌 글은 그대로 둬요
 */
const scrubUrlsInText = (text: string) =>
  text
    .replace(QUERY_AFTER_PATH_PATTERN, "$1")
    .replace(SECRET_PATH_PATTERN, "$1/[token]");

/** span 속성 값은 문자열, 문자열 배열, 또는 단위가 붙은 `{ value, unit }`이에요 */
const scrubSpanAttributeValue = (value: unknown): unknown => {
  if (typeof value === "string") return scrubUrlsInText(value);
  if (Array.isArray(value)) return value.map(scrubSpanAttributeValue);
  if (typeof value === "object" && value !== null && "value" in value) {
    return { ...value, value: scrubSpanAttributeValue(value.value) };
  }

  return value;
};

const pickKeys = (data: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(
    Object.entries(data).filter(([key]) => keys.includes(key)),
  );

const scrubHeaders = (headers: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(headers)
      .filter(([name]) => KEPT_HEADER_NAMES.includes(name.toLowerCase()))
      .map(([name, value]) => [name, scrubUrl(value)]),
  );

const scrubBreadcrumbData = (
  category: string | undefined,
  data: Record<string, unknown>,
) => {
  if (category === "fetch" || category === "xhr") {
    const kept = pickKeys(data, KEPT_HTTP_BREADCRUMB_KEYS);

    return { ...kept, url: scrubUrlValue(kept.url) };
  }

  if (category === "navigation") {
    return { from: scrubUrlValue(data.from), to: scrubUrlValue(data.to) };
  }

  // 콘솔에 넘긴 값에는 요청 설정 · 본문이 든 오류 객체가 섞여요(`logRequestError`). 문구(message)만 남겨요
  if (category === "console") {
    const { arguments: _arguments, ...rest } = data;

    return rest;
  }

  return data;
};

/**
 * Sentry 기록(breadcrumb) 하나에서 사용자 입력과 민감한 값을 지워요. `beforeBreadcrumb`에 써요.
 *
 * - fetch · xhr: 메서드, 쿼리를 뺀 주소, 상태 코드만 남겨요
 * - 화면 이동: 주소의 쿼리와 초대 토큰을 지워요
 * - 콘솔: 로그에 넘긴 값을 지우고 문구만 남겨요
 * - 클릭 · 입력(`ui.*`): 요소 위치(message)만 남기고 부가 값을 지워요
 */
export const scrubSentryBreadcrumb = (breadcrumb: Breadcrumb) => {
  const { data, ...rest } = breadcrumb;

  if (breadcrumb.category?.startsWith("ui.")) return rest;
  if (!data) return breadcrumb;

  return { ...rest, data: scrubBreadcrumbData(breadcrumb.category, data) };
};

/**
 * Sentry 오류 이벤트에서 쿠키, 인증 헤더, 요청 본문, 쿼리 파라미터를 지워요. `beforeSend`에 써요.
 *
 * 주소는 쿼리 · 해시를 지우고 초대 토큰을 가려요. 이벤트에 담긴 기록(breadcrumb)도 `scrubSentryBreadcrumb`로 함께 지워요.
 * 원래 이벤트는 바꾸지 않고 새 이벤트를 돌려줘요.
 */
export const scrubSentryEvent = (event: ErrorEvent): ErrorEvent => {
  const { request, breadcrumbs, ...rest } = event;
  const scrubbed: ErrorEvent = { ...rest };

  if (request) {
    const {
      cookies: _cookies,
      data: _data,
      query_string: _query,
      ...kept
    } = request;

    scrubbed.request = {
      ...kept,
      ...(kept.url && { url: scrubUrl(kept.url) }),
      ...(kept.headers && { headers: scrubHeaders(kept.headers) }),
    };
  }

  if (breadcrumbs) {
    scrubbed.breadcrumbs = breadcrumbs.map(scrubSentryBreadcrumb);
  }

  // 성능 추적이 붙인 화면 이름. 라우트를 찾기 전에는 주소 그대로라 초대 토큰이 들어 있을 수 있어요
  if (scrubbed.transaction) {
    scrubbed.transaction = scrubUrlsInText(scrubbed.transaction);
  }

  return scrubbed;
};

/**
 * 성능 측정 span에서 주소의 쿼리 파라미터, 해시, 초대 토큰을 지워요. `beforeSendSpan`에 써요.
 *
 * 이름과 모든 문자열 속성(`url.full`, `url.path`, `sentry.segment.name` 등)에 든 주소를 정리하고,
 * 쿼리 파라미터 · 해시만 담은 속성(`url.query` 등)은 지워요. 원래 span은 바꾸지 않고 새 span을 돌려줘요.
 */
export const scrubSentrySpan = (span: StreamedSpan): StreamedSpan => {
  const attributes = Object.fromEntries(
    Object.entries(span.attributes)
      .filter(([key]) => !QUERY_SPAN_ATTRIBUTE_KEYS.includes(key))
      .map(([key, value]) => [key, scrubSpanAttributeValue(value)]),
  );

  return { ...span, name: scrubUrlsInText(span.name), attributes };
};
