import useSendRecordingHeartbeatMutation from "@api/mutations/useSendRecordingHeartbeatMutation";
import useInterval from "@hooks/common/useInterval";
import useRecordingState from "@hooks/domain/recording/useRecordingState";
import { getRecordingControlProof } from "@utils/recordingControlProof";
import { useEffect } from "react";

/** 서버는 120초 동안 신호가 없으면 녹음을 끝내요. 몇 번 놓쳐도 이어지도록 30초마다 보내요 */
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

/**
 * 녹음하는 동안 이 탭이 살아 있음을 서버에 알리는 컴포넌트.
 *
 * 화면에 그리는 것은 없고, 놓여 있는 동안 30초마다 생존 신호를 보내요. 일시정지 중에도 보내요.
 * 신호가 성공하면 녹음한 시간을 서버가 알려 준 누적 시간으로 맞춰요.
 */
export default function RecordingHeartbeat() {
  const { session, syncElapsedTime } = useRecordingState();
  const { mutate: sendHeartbeat } = useSendRecordingHeartbeatMutation();

  const sendHeartbeatHandler = () => {
    const proof = getRecordingControlProof();
    if (!session || !proof) return;

    sendHeartbeat(
      { ...session, ...proof },
      {
        onSuccess: ({ elapsedMillis }) => syncElapsedTime(elapsedMillis),
        onError: () => sendHeartbeatHandler(),
      },
    );
  };

  const { start } = useInterval({
    callback: sendHeartbeatHandler,
    delay: HEARTBEAT_INTERVAL_MS,
  });

  useEffect(() => {
    start();
  }, [start]);

  return null;
}
