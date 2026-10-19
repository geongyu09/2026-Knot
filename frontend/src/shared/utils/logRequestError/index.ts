import { captureCaughtError, type CaughtErrorFeature } from "@provider/sentry";

interface LogRequestErrorParams {
  /** 실패한 동작이 속한 기능. Sentry 이벤트의 `feature` 태그가 돼요 */
  feature: CaughtErrorFeature;

  /** 실패한 동작 이름. 예: `녹음 시작` */
  action: string;

  error: unknown;
}

/**
 * 안내 없이 넘어가는 실패를 콘솔에 남기고 Sentry로 보내요.
 *
 * react-query가 이미 보낸 요청 실패는 같은 오류 객체라 SDK가 건너뛰어, 요청이 아닌 오류(녹음기 시작 예외 등)만 새로 남아요.
 */
export const logRequestError = ({
  feature,
  action,
  error,
}: LogRequestErrorParams) => {
  console.error(`${action} 요청에 실패했어요`, error);
  captureCaughtError({ error, feature });
};
