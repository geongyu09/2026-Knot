import { getCurrentRecordingApi } from "@api/fetch/api/v1/workspaces/[workspaceId]/recordings/current";
import { recordingKeys } from "@api/queryKey/recording";
import { useQuery } from "@tanstack/react-query";

/** 문서 정리 중인 녹음을 다시 물어보는 간격(ms). 정리 화면의 녹음 조회와 같아요 */
const POLL_INTERVAL_MS = 3000;

interface UseCurrentRecordingQueryParams {
  workspaceId: number;
}

/**
 * 워크스페이스에서 내 화면에 표시할 현재 녹음 한 건을 조회하는 쿼리 훅.
 *
 * 홈의 「진행 중인 녹음」 카드가 녹음 상태와 누적 녹음 시간을 보여 주는 데 써요.
 * 표시할 녹음이 없으면(204) `data`가 `null`이에요.
 * 문서 정리 중(`PROCESSING`)인 동안에는 3초 간격으로 다시 물어봐요. 정리가 끝나면 서버가 204로 답해 멈춰요.
 * 녹음 중 · 일시정지는 시간을 화면에서 늘리므로 다시 물어보지 않아요.
 *
 * `workspaceId`가 정수인지는 검사하지 않아요. `/workspace/abc` 같은 잘못된 주소여도 요청하고, 판단은 서버 응답에 맡겨요.
 */
const useCurrentRecordingQuery = ({
  workspaceId,
}: UseCurrentRecordingQueryParams) => {
  return useQuery({
    queryKey: recordingKeys.current(workspaceId),
    queryFn: () => getCurrentRecordingApi(workspaceId),
    refetchInterval: ({ state: { data } }) =>
      data?.status === "PROCESSING" ? POLL_INTERVAL_MS : false,
  });
};

export default useCurrentRecordingQuery;
