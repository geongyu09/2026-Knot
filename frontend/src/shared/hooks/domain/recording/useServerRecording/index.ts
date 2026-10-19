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
 * 조회 실패는 콘솔에 남기고, 받은 녹음이 아직 없을 때만 `isLoadFailed`로 알려요. 실패 안내는 쓰는 쪽이 정해요(홈 카드는 ERR-09).
 * 한 번 받은 뒤 다시 조회만 실패하면 받은 녹음을 그대로 보여 줘요.
 * `retry`는 현재 녹음만 다시 조회해요.
 */
const useServerRecording = () => {
  const { workspaceId } = useParams();
  const { data, dataUpdatedAt, isLoading, error, refetch } =
    useCurrentRecordingQuery({
      workspaceId: Number(workspaceId),
    });

  useEffect(() => {
    if (error)
      logRequestError({
        feature: "recording",
        action: "현재 녹음 조회",
        error,
      });
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
    isLoadFailed: data === undefined && error !== null,
    retry: () => {
      refetch();
    },
  };
};

export default useServerRecording;
