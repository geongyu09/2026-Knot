import useCurrentRecordingQuery from "@api/queries/useCurrentRecordingQuery";
import useNow from "@hooks/common/useNow";
import { calculateElapsedSeconds } from "@utils/calculateElapsedSeconds";
import { formatRecordingTime } from "@utils/formatRecordingTime";
import { logRequestError } from "@utils/logRequestError";
import { useEffect } from "react";
import { useParams } from "react-router";

import type { CurrentRecordingStatus } from "@/shared/types/recording";

/**
 * 현재 `:workspaceId`의 현재 녹음 조회 응답을 화면에 보여 줄 상태와 시간으로 바꿔요.
 *
 * 응답의 누적 시간에 응답을 받은 뒤 흐른 시간을 더해 녹음 중이면 매초 늘리고, 일시정지면 멈춰 둬요.
 * 녹음 중·일시정지가 아닌 녹음(문서 정리 중·실패)과 조회 실패는 `status`가 `null`이에요.
 * 조회 실패는 기획 논의 전이라 안내 없이 콘솔에만 남겨요.
 */
const useServerRecording = () => {
  const { workspaceId } = useParams();
  const { data, dataUpdatedAt, isLoading, error } = useCurrentRecordingQuery({
    workspaceId: Number(workspaceId),
  });

  useEffect(() => {
    if (error) logRequestError("현재 녹음 조회", error);
  }, [error]);

  const isRecording = data?.status === "RECORDING";
  const isPaused = data?.status === "PAUSED";

  // 서버가 녹음 중이라고 답한 동안만 시간 표시를 다시 그려요
  const now = useNow(isRecording);

  const status: CurrentRecordingStatus | null = isRecording
    ? "recording"
    : isPaused
      ? "paused"
      : null;

  return {
    status,
    elapsedTime: formatRecordingTime(
      calculateElapsedSeconds(
        data?.elapsedMillis ?? 0,
        isRecording ? dataUpdatedAt : null,
        now,
      ),
    ),
    isLoading,
  };
};

export default useServerRecording;
