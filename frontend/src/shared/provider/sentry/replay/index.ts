import { replayIntegration } from "@sentry/react";

/**
 * 세션 리플레이 통합을 만들어요. 크기가 커서 `initSentry`가 첫 화면 번들과 따로 받아 붙여요.
 *
 * 화면의 글자, 입력 값, 이미지와 미디어는 가리지 않아요. 가리면 어떤 버튼, 안내, 입력에서 오류가 났는지 알 수 없어요.
 * SDK는 글자를 보이게 해도 `title`, `placeholder`, `aria-label` 속성은 따로 가려서, 가릴 속성을 비워 둬요.
 * 네트워크 요청은 주소, 메서드, 상태 코드만 남기고 본문과 헤더는 남기지 않아요(상세 기록을 허용하는 주소가 없어요).
 */
export const createReplayIntegration = () =>
  replayIntegration({
    maskAllText: false,
    maskAllInputs: false,
    blockAllMedia: false,
    maskAttributes: [],
    networkDetailAllowUrls: [],
    networkCaptureBodies: false,
    networkRequestHeaders: [],
    networkResponseHeaders: [],
  });
