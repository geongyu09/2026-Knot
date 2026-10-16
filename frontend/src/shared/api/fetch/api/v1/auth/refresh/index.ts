/**
 * 토큰 재발급 경로. refresh 쿠키와 CSRF 헤더로 새 access · refresh 쿠키를 받아요(204).
 *
 * 요청은 화면이 아니라 `httpClient`의 `refreshInterceptor`가 401을 받았을 때 보내요.
 * 그 인터셉터는 `httpClient`를 만드는 쪽이라 이 폴더의 요청 함수를 쓰면 서로를 import하게 돼서,
 * 여기에는 mock 핸들러와 테스트가 쓸 경로만 둬요.
 */
export const AUTH_REFRESH_API_PATH = "/api/v1/auth/refresh";
