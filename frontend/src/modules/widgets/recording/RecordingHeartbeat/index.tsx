import useInterval from "@hooks/common/useInterval";
import useRecordingControl from "@hooks/domain/recording/useRecordingControl";
import useRecordingMaxDuration from "@hooks/domain/recording/useRecordingMaxDuration";
import { type ReactNode, useEffect } from "react";

/** 서버는 120초 동안 신호가 없으면 녹음을 끝내요. 몇 번 놓쳐도 이어지도록 30초마다 보내요 */
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

interface RecordingHeartbeatProps {
  children: ReactNode;
}

/**
 * 녹음하는 동안 이 탭이 살아 있음을 서버에 알리는 컴포넌트.
 *
 * 감싼 화면을 그대로 그리고, 놓여 있는 동안 30초마다 생존 신호를 보내요. 일시정지 중에도 보내고, 끝내는 중에는 보내지 않아요.
 * 신호가 실패하면 곧바로 다시 보내지 않고 다음 주기에 보내요.
 * 녹음한 시간이 2시간에 닿으면 서버가 녹음을 끝내므로, 다음 주기를 기다리지 않고 신호를 한 번 보내 바로 확인해요.
 * 응답에 맞춰 녹음한 시간을 맞추거나 서버가 끝낸 녹음을 닫는 일은 `useRecordingControl`이 맡아요.
 */
export default function RecordingHeartbeat({
  children,
}: RecordingHeartbeatProps) {
  const { sendHeartbeat } = useRecordingControl();

  const { start } = useInterval({
    callback: sendHeartbeat,
    delay: HEARTBEAT_INTERVAL_MS,
  });

  useEffect(() => {
    start();
  }, [start]);

  useRecordingMaxDuration({ onReached: sendHeartbeat });

  return children;
}
