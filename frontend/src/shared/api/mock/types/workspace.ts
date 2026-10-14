export interface WorkspaceListItem {
  id: number;
  name: string;
}

export interface WorkspacesResponse {
  /** 본 적이 없으면 null */
  lastViewedWorkspaceId: number | null;
  workspaces: WorkspaceListItem[];
}

export interface WorkspaceDetailResponse {
  name: string;
  myRole: "OWNER" | "MEMBER";
  /** 나를 포함한 멤버 수 */
  activeMemberCount: number;
}

export interface WorkspaceCreateResponse {
  id: number;
}
