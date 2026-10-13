import { http, HttpResponse } from "msw";

import { recordingHeartbeatResponse } from "@api/mock/responses/recording";

export const recordingHeartbeatHandlers = [
  http.post(
    "*/api/v1/workspaces/:workspaceId/recordings/:recordingId/heartbeat",
    () => HttpResponse.json(recordingHeartbeatResponse),
  ),
];
