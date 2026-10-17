import { http, HttpResponse } from "msw";

import { ownershipTransferCandidatesResponse } from "@api/mock/responses/workspace";

export const ownershipTransferCandidatesHandlers = [
  http.get(
    "*/api/v1/workspaces/:workspaceId/ownership-transfer-candidates",
    () => HttpResponse.json(ownershipTransferCandidatesResponse),
  ),
];
