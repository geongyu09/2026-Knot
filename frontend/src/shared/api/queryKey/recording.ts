interface RecordingDetailKeyParams {
  workspaceId: number;
  recordingId: number;
}

export const recordingKeys = {
  all: ["recordings"] as const,
  current: (workspaceId: number) =>
    [...recordingKeys.all, "current", workspaceId] as const,
  detail: ({ workspaceId, recordingId }: RecordingDetailKeyParams) =>
    [...recordingKeys.all, "detail", workspaceId, recordingId] as const,
  audioSave: ({ workspaceId, recordingId }: RecordingDetailKeyParams) =>
    [...recordingKeys.all, "audioSave", workspaceId, recordingId] as const,
};
