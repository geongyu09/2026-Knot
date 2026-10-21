interface GetAccessDeniedFallbackWorkspaceIdParams {
  /** 들어갈 수 없게 된 워크스페이스 ID. 주소에서 읽지 못했으면 `undefined` */
  deniedWorkspaceId: number | undefined;
  /** 마지막으로 본 워크스페이스 ID. 본 적이 없으면 `null` */
  lastViewedWorkspaceId: number | null;
  /** 내가 속한 워크스페이스 목록 */
  workspaces: { id: number }[];
}

/**
 * 들어갈 수 없는 워크스페이스(ERR-11)에서 대신 보낼 워크스페이스를 고릅니다(D7).
 *
 * 마지막으로 본 워크스페이스가 들어갈 수 없는 그 워크스페이스가 아니고 아직 목록에 있을 때만 그 ID를 돌려줘요.
 * 진입 분기(`getEntryWorkspaceId`)와 달리 첫 워크스페이스로 대신 보내지 않아요.
 * 회원이 고른 적 없는 워크스페이스로 보내기보다, 선택 화면에서 직접 고르게 하는 것이 정책(D7)이에요.
 * 보낼 곳이 없으면 `undefined`이고, 그때는 워크스페이스 선택 화면으로 보내요.
 *
 * @example
 * getAccessDeniedFallbackWorkspaceId({ deniedWorkspaceId: 1, lastViewedWorkspaceId: 2, workspaces: [{ id: 2 }] }); // 2
 */
export const getAccessDeniedFallbackWorkspaceId = ({
  deniedWorkspaceId,
  lastViewedWorkspaceId,
  workspaces,
}: GetAccessDeniedFallbackWorkspaceIdParams) => {
  if (lastViewedWorkspaceId === deniedWorkspaceId) return undefined;

  return workspaces.find(({ id }) => id === lastViewedWorkspaceId)?.id;
};
