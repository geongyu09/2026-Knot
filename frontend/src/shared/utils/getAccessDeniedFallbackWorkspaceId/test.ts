import { describe, expect, it } from "vitest";

import { getAccessDeniedFallbackWorkspaceId } from ".";

describe("getAccessDeniedFallbackWorkspaceId", () => {
  it("마지막으로 본 워크스페이스가 들어갈 수 없는 워크스페이스와 다르고 목록에 있으면 그 워크스페이스로 보낸다", () => {
    const workspaceId = getAccessDeniedFallbackWorkspaceId({
      deniedWorkspaceId: 1,
      lastViewedWorkspaceId: 2,
      workspaces: [{ id: 2 }, { id: 3 }],
    });

    expect(workspaceId).toBe(2);
  });

  it("마지막으로 본 워크스페이스가 들어갈 수 없는 그 워크스페이스면 보낼 곳이 없다", () => {
    const workspaceId = getAccessDeniedFallbackWorkspaceId({
      deniedWorkspaceId: 1,
      lastViewedWorkspaceId: 1,
      workspaces: [{ id: 1 }, { id: 2 }],
    });

    expect(workspaceId).toBeUndefined();
  });

  it("마지막으로 본 워크스페이스가 목록에서 사라졌으면 첫 워크스페이스로 보내지 않고 보낼 곳이 없다", () => {
    const workspaceId = getAccessDeniedFallbackWorkspaceId({
      deniedWorkspaceId: 1,
      lastViewedWorkspaceId: 99,
      workspaces: [{ id: 2 }],
    });

    expect(workspaceId).toBeUndefined();
  });

  it("마지막으로 본 워크스페이스가 없으면 보낼 곳이 없다", () => {
    const workspaceId = getAccessDeniedFallbackWorkspaceId({
      deniedWorkspaceId: 1,
      lastViewedWorkspaceId: null,
      workspaces: [{ id: 2 }],
    });

    expect(workspaceId).toBeUndefined();
  });
});
