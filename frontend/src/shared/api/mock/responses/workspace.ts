import type {
  OwnershipTransferCandidate,
  WorkspaceCreateResponse,
  WorkspaceDetailResponse,
  WorkspacesResponse,
} from "@api/mock/types/workspace";

export const workspacesResponse = {
  lastViewedWorkspaceId: 1,
  workspaces: [
    { id: 1, name: "Knot 팀" },
    { id: 2, name: "노티드의 워크스페이스" },
  ],
} satisfies WorkspacesResponse;

// 승계 후보가 있는 owner를 기본으로 둬요. 멤버 수는 나와 아래 후보를 더한 값이에요
export const workspaceDetailResponse = {
  name: "Knot 팀",
  myRole: "OWNER",
  activeMemberCount: 4,
} satisfies WorkspaceDetailResponse;

export const ownershipTransferCandidatesResponse = [
  { memberId: 2, nickname: "도넛" },
  { memberId: 3, nickname: "흑곰" },
  { memberId: 4, nickname: "루루" },
] satisfies OwnershipTransferCandidate[];

export const workspaceCreateResponse = {
  id: 3,
} satisfies WorkspaceCreateResponse;
