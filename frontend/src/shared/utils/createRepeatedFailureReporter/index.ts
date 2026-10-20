import { captureCaughtError, type CaughtErrorFeature } from "@provider/sentry";
import { getRequestErrorFingerprint } from "@utils/getRequestErrorFingerprint";

interface CreateRepeatedFailureReporterParams {
  /** 실패한 동작이 속한 기능. Sentry 이벤트의 `feature` 태그가 돼요 */
  feature: CaughtErrorFeature;

  /** 실패한 동작 이름. 콘솔에 남겨요. 예: `녹음 생존 신호` */
  action: string;
}

interface ReportFailureParams {
  error: unknown;

  /** 더 보내지 않고 포기한 실패인지. 이미 보낸 종류여도 보내요 */
  isGivingUp?: boolean;

  /** 실패를 세는 단위. 바뀌면 처음부터 다시 세요. 예: 녹음 ID */
  scope?: number | string;
}

/** 같은 실패인지 가르는 값. 요청 실패는 Sentry 묶음 기준을, 그 밖의 오류는 이름과 문구를 써요 */
const toFailureKind = (error: unknown) =>
  getRequestErrorFingerprint(error)?.join(" ") ??
  (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

/**
 * 같은 요청을 거듭 보내는 곳(재시도 루프, 주기 요청)의 실패를 골라 Sentry로 보내요. 콘솔에는 실패마다 남겨요.
 *
 * 실패할 때마다 보내면 장애 한 번이 시도 수만큼 쌓여 횟수로 심각도를 가늠할 수 없어요.
 * 그래서 연속 실패 중 종류(`toFailureKind`)마다 처음 난 실패와 끝내 포기한 실패만, 그때까지의 연속 실패 수를 실어 보내요.
 * 성공하면 `reset`으로 다시 세요.
 *
 * 이 실패를 내는 뮤테이션은 MutationCache가 시도마다 보내지 않도록 `meta.errorReport`를 `caller`로 둬요.
 *
 * @example
 * const heartbeatFailures = createRepeatedFailureReporter({ feature: "recording", action: "녹음 생존 신호" });
 * heartbeatFailures.report({ error, scope: recordingId });
 */
export const createRepeatedFailureReporter = ({
  feature,
  action,
}: CreateRepeatedFailureReporterParams) => {
  let failureCount = 0;
  let currentScope: ReportFailureParams["scope"];
  const reportedKinds = new Set<string>();

  const reset = () => {
    failureCount = 0;
    reportedKinds.clear();
  };

  const report = ({
    error,
    isGivingUp = false,
    scope,
  }: ReportFailureParams) => {
    if (scope !== currentScope) {
      reset();
      currentScope = scope;
    }
    failureCount += 1;
    console.error(`${action} 요청에 실패했어요`, error);

    const kind = toFailureKind(error);
    if (reportedKinds.has(kind) && !isGivingUp) return;

    reportedKinds.add(kind);
    captureCaughtError({
      error,
      feature,
      extra: {
        consecutiveFailures: failureCount,
        ...(isGivingUp && { isGivingUp }),
      },
    });
  };

  return { report, reset };
};
