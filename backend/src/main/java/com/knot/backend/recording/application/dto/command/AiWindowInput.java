package com.knot.backend.recording.application.dto.command;

public record AiWindowInput(
        String pipelineVersion,
        String inputManifestSha256,
        long inputStartFrame,
        long inputEndFrame
) {
}
