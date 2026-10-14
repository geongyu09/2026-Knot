import { http, HttpResponse } from "msw";

export const ownershipTransfersHandlers = [
  http.post(
    "*/api/v1/workspaces/:workspaceId/ownership-transfers",
    () => new HttpResponse(null, { status: 204 }),
  ),
];
