import { http, HttpResponse } from "msw";

import { AUTH_REFRESH_API_PATH } from "@api/fetch/api/v1/auth/refresh";

// 기본 응답은 재발급 성공(204)이에요. 새 쿠키는 브라우저가 받는 것이라 본문이 없어요
export const authRefreshHandlers = [
  http.post(
    `*${AUTH_REFRESH_API_PATH}`,
    () => new HttpResponse(null, { status: 204 }),
  ),
];
