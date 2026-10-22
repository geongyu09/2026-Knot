import { useRecordingStore } from "@store/recordingStore";
import { readMicrophonePermission } from "@utils/readMicrophonePermission";
import { trackRecordingStartFailed } from "@utils/trackRecordingStartFailed";
import { useCallback } from "react";

type TrackRecordingStartFailedParams = Parameters<
  typeof trackRecordingStartFailed
>[0];

type StartFailure = TrackRecordingStartFailedParams["result"];

/** 안내 창을 띄우는 시작 결과. 안내 없이 끝나는 실패(`failed`)는 세지 않아요 */
const START_FAILURES: StartFailure[] = [
  "microphoneUnavailable",
  "refused",
  "networkFailed",
];

const isStartFailure = (result: string): result is StartFailure =>
  START_FAILURES.some((failure) => failure === result);

/** 이 탭에서 시작하지 못한 횟수. 새로고침하면 처음부터 세요 */
let failedAttempts = 0;

interface TrackStartFailureParams {
  result: StartFailure;
  /** 녹음을 누를 때 읽기 시작한 마이크 권한 상태 */
  permissionBefore: ReturnType<typeof readMicrophonePermission>;
  surface: TrackRecordingStartFailedParams["surface"];
  workspaceId: number;
}

/** 시작하지 못한 이유를 모아 사용 기록으로 보내요. 권한 상태를 다 읽은 뒤에 보내므로 부른 쪽은 기다리지 않아요 */
const trackStartFailure = async ({
  result,
  permissionBefore,
  surface,
  workspaceId,
}: TrackStartFailureParams) => {
  // 다음 시도가 덮어쓰기 전에 이번 실패의 오류 이름과 순서를 정해 둬요
  const { microphoneErrorName } = useRecordingStore.getState();
  failedAttempts += 1;
  const attempt = failedAttempts;
  const permissionAfter = readMicrophonePermission();

  try {
    trackRecordingStartFailed({
      result,
      errorName: microphoneErrorName,
      permissionBefore: await permissionBefore,
      permissionAfter: await permissionAfter,
      attempt,
      surface,
      workspaceId,
    });
  } catch {
    // 사용 기록을 보내지 못해도 녹음 안내에는 영향이 없어 삼켜요
  }
};

interface UseRecordingStartAnalyticsParams<StartResult extends string> {
  /** 녹음을 시작하고 결과를 돌려주는 함수. `useRecordingControl`의 시작이에요 */
  startRecording: (workspaceId: number) => Promise<StartResult>;
  /** 녹음을 이어 가고 이어 갔는지 돌려주는 함수. `useRecordingControl`의 이어서 녹음이에요 */
  resumeRecording: () => Promise<boolean>;
}

/**
 * 녹음 시작 · 이어서 녹음 함수를 감싸, 안내 창을 띄우는 실패를 사용 기록(`recording_start_failed`)으로도 보내는 도메인 훅.
 *
 * 시작은 독의 마이크에서만, 이어서 녹음은 녹음 바에서만 불러서 누른 곳을 함수마다 정해요. 감싼 함수의 동작과 반환값은 그대로예요.
 * 권한 창이 뜨기 전의 권한 상태를 읽기 시작하되 시작을 기다리게 하지 않고, 사용 기록은 결과를 돌려준 뒤에 보내요.
 */
const useRecordingStartAnalytics = <StartResult extends string>({
  startRecording,
  resumeRecording,
}: UseRecordingStartAnalyticsParams<StartResult>) => {
  const startAndTrackRecording = useCallback(
    async (workspaceId: number) => {
      const permissionBefore = readMicrophonePermission();
      const result = await startRecording(workspaceId);

      if (isStartFailure(result)) {
        void trackStartFailure({
          result,
          permissionBefore,
          surface: "dock",
          workspaceId,
        });
      }

      return result;
    },
    [startRecording],
  );

  const resumeAndTrackRecording = useCallback(async () => {
    const permissionBefore = readMicrophonePermission();
    const { session } = useRecordingStore.getState();
    const isResumed = await resumeRecording();

    // 이어 가지 못하면 녹음 바가 마이크 안내 창을 띄워요
    if (!isResumed && session) {
      void trackStartFailure({
        result: "microphoneUnavailable",
        permissionBefore,
        surface: "recorder_bar",
        workspaceId: session.workspaceId,
      });
    }

    return isResumed;
  }, [resumeRecording]);

  return { startAndTrackRecording, resumeAndTrackRecording };
};

export default useRecordingStartAnalytics;
