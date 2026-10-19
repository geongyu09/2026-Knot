import { setAnalyticsWorkspace } from "@utils/analyticsWorkspace";
import { useEffect } from "react";
import { useParams } from "react-router";

/**
 * 워크스페이스 화면에 있는 동안 사용 기록에 그 워크스페이스 id를 붙이게 하는 도메인 훅. 워크스페이스 레이아웃에서 한 번만 불러요.
 *
 * 다른 워크스페이스로 옮기면 바꾸고, 워크스페이스 밖으로 나가면(레이아웃이 사라지면) 비워요.
 * 이벤트에 붙이는 일은 `posthog.init`의 `before_send`(`attachAnalyticsWorkspace`)가 해요.
 */
const useWorkspaceAnalytics = () => {
  const { workspaceId } = useParams();

  useEffect(() => {
    const id = Number(workspaceId);
    // 정수가 아닌 주소는 레이아웃이 워크스페이스 선택 화면으로 보내요
    if (!Number.isInteger(id)) return;

    setAnalyticsWorkspace(id);

    return () => setAnalyticsWorkspace(null);
  }, [workspaceId]);
};

export default useWorkspaceAnalytics;
