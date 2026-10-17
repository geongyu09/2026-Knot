import { http, HttpResponse } from "msw";

export const workspaceLeaveHandlers = [
  http.delete(
    "*/api/v1/workspaces/:workspaceId/members/me",
    () => new HttpResponse(null, { status: 204 }),
  ),
];
