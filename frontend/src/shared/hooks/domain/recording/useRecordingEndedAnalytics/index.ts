import { useRecordingStore } from "@store/recordingStore";
import { trackRecordingEnded } from "@utils/trackRecordingEnded";
import { useCallback } from "react";

/** 녹음을 끝내고 결과를 돌려주는 함수. `useRecordingControl`의 끝내기예요 */
type EndRecording = () => Promise<
  Parameters<typeof trackRecordingEnded>[0]["result"]
>;

/**
 * 녹음을 끝내는 함수를 감싸, 끝낸 결과를 사용 기록(`recording_ended`)으로도 보내는 도메인 훅.
 *
 * 끝내기의 결과는 상태에 남지 않고 함수의 반환값으로만 나와서, 지켜보지 않고 감싸요. 감싼 함수의 동작과 반환값은 그대로예요.
 * 끝내는 동안 녹음 세션이 비워지므로 끝내기 전에 세션을 읽어 둬요.
 */
const useRecordingEndedAnalytics = (endRecording: EndRecording) =>
  useCallback(async () => {
    const { session } = useRecordingStore.getState();
    const result = await endRecording();

    if (session) trackRecordingEnded({ ...session, result });

    return result;
  }, [endRecording]);

export default useRecordingEndedAnalytics;
