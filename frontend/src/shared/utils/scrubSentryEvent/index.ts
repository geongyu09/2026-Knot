import type { Breadcrumb, ErrorEvent } from "@sentry/react";

/**
 * 비밀 값이 경로에 들어가는 주소. 화면의 초대 링크(`/invite/:token`)와 초대 판정 API(`/api/v1/invitations/:tokenOrCode`)예요.
 */
const SECRET_PATH_PATTERN = /(\/invite|\/api\/v1\/invitations)\/[^/?#]+/g;

/** 요청 헤더 중 남기는 것. 쿠키 · 인증 · CSRF 헤더는 남기지 않아요 */
const KEPT_HEADER_NAMES = ["user-agent", "referer"];

/** fetch · xhr 기록 중 남기는 값. 요청 · 응답 본문은 남기지 않아요 */
const KEPT_HTTP_BREADCRUMB_KEYS = ["method", "url", "status_code"];

/** 주소에서 쿼리 파라미터와 해시를 지우고 경로의 초대 토큰을 가려요 */
const scrubUrl = (url: string) =>
  url.split(/[?#]/)[0].replace(SECRET_PATH_PATTERN, "$1/[token]");

const scrubUrlValue = (value: unknown) =>
  typeof value === "string" ? scrubUrl(value) : value;

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

  return scrubbed;
};
