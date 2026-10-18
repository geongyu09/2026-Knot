import { http, HttpResponse } from "msw";

import { recordingAudioSaveResponse } from "@api/mock/responses/recording";

export const recordingAudioSaveHandlers = [
  http.get(
    "*/api/v1/workspaces/:workspaceId/recordings/:recordingId/audio-save",
    () => HttpResponse.json(recordingAudioSaveResponse),
  ),
];
