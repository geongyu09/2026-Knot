import { replayIntegration } from "@sentry/react";

/**
 * 세션 리플레이 통합을 만들어요. 크기가 커서 `initSentry`가 첫 화면 번들과 따로 받아 붙여요.
 *
 * 화면의 글자, 입력 값, 이미지와 미디어는 모두 가려요(SDK 기본값이지만 바뀌어도 그대로이도록 적어 둬요).
 * 네트워크 요청은 주소, 메서드, 상태 코드만 남기고 본문과 헤더는 남기지 않아요(상세 기록을 허용하는 주소가 없어요).
 */
export const createReplayIntegration = () =>
  replayIntegration({
    maskAllText: true,
    maskAllInputs: true,
    blockAllMedia: true,
    networkDetailAllowUrls: [],
    networkCaptureBodies: false,
    networkRequestHeaders: [],
    networkResponseHeaders: [],
  });
