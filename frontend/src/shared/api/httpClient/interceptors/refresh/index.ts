import { captureCaughtError } from "@provider/sentry";
import {
  markAuthSessionConfirmed,
  markAuthSessionExpired,
} from "@utils/authSession";
import type { AxiosInstance } from "axios";
import axios from "axios";

import { HTTP_ERROR_TYPE, isHttpError } from "../../error";
import type { HttpInterceptor } from "../../types/interceptor";
import { CSRF_API_PATH } from "../csrf";

/** 토큰을 재발급하는 경로. refresh 쿠키와 CSRF 헤더로 새 access · refresh 쿠키를 받아요(204). */
const REFRESH_API_PATH = "/api/v1/auth/refresh";

/**
 * 401을 받아도 재발급하지 않는 요청.
 *
 * 재발급 요청의 401은 refresh 토큰도 쓸 수 없다는 뜻이라 다시 재발급하면 끝없이 반복돼요.
 * CSRF 토큰 조회는 재발급 요청이 CSRF 토큰을 받으려고 부르는 요청이라 같은 이유로 뺍니다.
 */
const SKIPPED_PATHS = [REFRESH_API_PATH, CSRF_API_PATH];

/**
 * 로그인 확인 경로. 성공하면 이 탭이 로그인한 상태였다고 기록해, 그 뒤의 재발급 거절을 로그인 만료로 알릴 수 있게 해요.
 * 재발급 경로처럼 요청 함수 폴더를 import하면 서로를 import하게 돼서 경로만 따로 적어요.
 */
const AUTH_ME_API_PATH = "/api/v1/auth/me";

const isSkippedRequest = (url?: string) =>
  SKIPPED_PATHS.some((path) => url?.startsWith(path));

const isUnauthorized = (error: unknown) =>
  axios.isAxiosError(error) && error.response?.status === 401;

/** 탭 사이에서 재발급을 하나씩 실행하려고 잡는 Web Locks 이름. 같은 출처의 모든 탭이 같은 이름을 써요. */
const REFRESH_LOCK_NAME = "knot-auth-refresh";

/**
 * 탭 사이 잠금을 잡은 채로 `task`를 실행해요. Web Locks가 없는 브라우저는 잠금 없이 바로 실행해요.
 *
 * 탭마다 자바스크립트가 따로 돌아서, 탭 안의 「재발급 한 번」만으로는 다른 탭의 재발급을 막지 못해요.
 * 앞 탭의 재발급 응답이 새 쿠키를 저장한 뒤에 다음 탭의 재발급이 나가야 같은 refresh 토큰이 두 번 쓰이지 않아요.
 */
const withRefreshLock = (task: () => Promise<void>) =>
  "locks" in navigator
    ? navigator.locks.request(REFRESH_LOCK_NAME, task)
    : task();

/** 지금 진행 중인 재발급. 같은 탭에서 동시에 401을 받은 요청들이 이 하나를 함께 기다려요. */
let refreshing: Promise<void> | undefined;

/**
 * 재발급이 성공할 때마다 1씩 늘어요.
 *
 * 만료된 토큰으로 함께 보낸 요청이라도 401이 도착하는 때는 제각각이에요.
 * 요청을 보낼 때의 값과 401을 받았을 때의 값이 다르면 그 사이에 다른 요청이 재발급을 끝낸 것이라,
 * 새 쿠키로 다시 보내기만 하고 재발급을 또 부르지 않아요.
 */
let refreshCount = 0;

/**
 * 진행 중인 재발급이 있으면 그것을 기다리고, 없으면 새로 시작해요.
 *
 * 실패하면 재발급 오류를 Sentry로 보내요. 기다리던 요청들은 원래 요청의 401을 던져 재발급 오류가 남지 않기 때문이에요.
 * 함께 기다린 요청이 여럿이어도 재발급 한 번에 한 건이에요.
 */
const refreshTokens = (client: AxiosInstance) => {
  refreshing ??= withRefreshLock(async () => {
    await client.post(REFRESH_API_PATH);
  })
    .then(() => {
      refreshCount += 1;
    })
    .catch((error: unknown) => {
      // 서버가 refresh 토큰을 거절한(401) 것만 만료로 봐요. 서버 오류·연결 문제로 실패한 재발급은 로그인이 풀렸는지 알 수 없어요.
      // 재발급은 `client`로 보내 바깥의 `httpErrorInterceptor`를 거치므로 HttpError로 와요
      if (isHttpError(error, HTTP_ERROR_TYPE.unauthorized)) {
        markAuthSessionExpired();
      }
      captureCaughtError({ error, feature: "auth" });
      throw error;
    })
    .finally(() => {
      refreshing = undefined;
    });

  return refreshing;
};

/**
 * 401이 오면 토큰을 재발급하고, 재발급에 성공하면 원래 요청을 한 번만 다시 보냅니다.
 *
 * 접근 토큰은 1시간 뒤 만료돼요. 그때 받은 401을 그대로 던지면 화면이 로그인 화면으로 보내서,
 * 사용자가 GitHub 로그인을 다시 해야 합니다. 재발급 요청은 `client`로 보내 CSRF 토큰도 붙어요.
 *
 * 재발급이 실패하거나 다시 보낸 요청도 401이면 원래 오류를 그대로 던져, 화면마다의 401 처리(로그인 화면 이동)가 그대로 동작하게 해요.
 * 다시 보낸 요청의 401은 재발급하지 않아, 계속 401인 상황에서 요청이 반복되지 않습니다.
 *
 * 같은 탭에서 401이 여러 개 와도 재발급은 한 번만 보내고, 탭 사이에서는 Web Locks로 하나씩 보내요.
 * 백엔드는 이미 쓴 refresh 토큰이 다시 오면 그 세션을 끊으므로, 같은 토큰으로 재발급이 두 번 나가면 로그인이 풀려요.
 * 원래 요청은 잠금을 놓은 뒤에 다시 보내, 다른 탭의 재발급을 오래 막지 않아요.
 *
 * 로그인 확인이 성공하면 이 탭을 로그인한 상태로, 그 뒤 재발급이 401로 거절되면 로그인 만료로 기록해요(`authSession`).
 * 로그인 화면은 이 기록으로 만료 토스트를 띄워요. 처음 온 비로그인 사용자의 재발급 실패는 기록하지 않아요.
 *
 * 401을 보고 판단하므로 `httpErrorInterceptor`보다 안쪽에 `use`하고,
 * 다시 보낸 요청에도 CSRF 토큰이 붙도록 `csrfInterceptor`보다 바깥에 `use`해요.
 */
export const refreshInterceptor: HttpInterceptor =
  (next, client) => async (config) => {
    if (isSkippedRequest(config.url)) return next(config);

    const refreshCountAtSend = refreshCount;

    try {
      const response = await next(config);
      if (config.url === AUTH_ME_API_PATH) markAuthSessionConfirmed();

      return response;
    } catch (error) {
      if (!isUnauthorized(error)) throw error;

      if (refreshCount === refreshCountAtSend) {
        try {
          await refreshTokens(client);
        } catch {
          throw error;
        }
      }

      return next(config);
    }
  };
