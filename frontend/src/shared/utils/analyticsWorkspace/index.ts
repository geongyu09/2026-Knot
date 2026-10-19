import type { BeforeSendFn } from "posthog-js";

/** 지금 보고 있는 워크스페이스 id. 워크스페이스 밖이면 null이에요 */
let currentWorkspaceId: number | null = null;

/**
 * @description 사용 기록에 붙일 지금 워크스페이스를 정해요. 워크스페이스 밖으로 나가면 null로 비워요
 * @param workspaceId - 지금 보고 있는 워크스페이스 id. 예: `3`
 * @example
 * setAnalyticsWorkspace(3);
 *
 * PostHog의 super property는 브라우저 저장소에 남아 새로고침 뒤 워크스페이스 밖 기록에도 붙을 수 있어서, 메모리에만 둬요.
 */
export const setAnalyticsWorkspace = (workspaceId: number | null) => {
  currentWorkspaceId = workspaceId;
};

/**
 * @description `posthog.init`의 `before_send`. 보내기 직전의 이벤트(자동 기록 포함)에 지금 워크스페이스 id를 `workspace_id`로 붙여요
 * @param event - 보낼 이벤트
 * @returns workspace_id를 붙인 이벤트. 워크스페이스 밖이면 받은 이벤트 그대로예요
 * @example
 * posthog.init(key, { before_send: attachAnalyticsWorkspace });
 */
export const attachAnalyticsWorkspace: BeforeSendFn = (event) => {
  if (currentWorkspaceId === null) return event;

  return {
    ...event,
    properties: { ...event.properties, workspace_id: currentWorkspaceId },
  };
};
