package com.knot.ai.transcription.domain;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

public record WindowEvidence(
        int schemaVersion,
        String pipelineVersion,
        String inputManifestSha256,
        long inputStartFrame,
        long inputEndFrame,
        String modelVersion,
        List<Token> tokens,
        List<Speaker> speakers
) {
    public WindowEvidence {
        new WindowInput(
                pipelineVersion,
                inputManifestSha256,
                inputStartFrame,
                inputEndFrame
        );
        if (schemaVersion != 1 || modelVersion == null || modelVersion.isBlank() || modelVersion.length() > 256
                || tokens == null || speakers == null || tokens.size() > 20000 || speakers.size() > 64) {
            throw invalid();
        }
        long frames = inputEndFrame - inputStartFrame;
        Set<String> ids = new HashSet<>();
        for (Speaker speaker : speakers) {
            if (speaker == null || !ids.add(speaker.speakerId()) || speaker.voicedFrames() > frames) {
                throw invalid();
            }
        }
        long previous = -1;
        for (Token token : tokens) {
            if (token == null || token.startFrame() < previous || token.endFrame() > frames
                    || !ids.contains(token.speakerId())) {
                throw invalid();
            }
            previous = token.startFrame();
        }
        tokens = List.copyOf(tokens);
        speakers = List.copyOf(speakers);
    }

    private static TranscriptionException invalid() {
        return new TranscriptionException(TranscriptionErrorCode.INVALID_RESULT);
    }

    public record Token(
            long startFrame,
            long endFrame,
            String text,
            String speakerId
    ) {
        public Token {
            if (startFrame < 0 || endFrame <= startFrame || text == null || text.isBlank() || speakerId == null
                    || speakerId.isBlank()) {
                throw invalid();
            }
        }
    }

    public record Speaker(
            String speakerId,
            List<Double> embedding,
            long voicedFrames
    ) {
        public Speaker {
            if (speakerId == null || speakerId.isBlank() || embedding == null || voicedFrames < 0
                    || (!embedding.isEmpty() && embedding.size() != 512) || embedding.stream()
                            .anyMatch(value -> value == null || !Double.isFinite(value))) {
                throw invalid();
            }
            embedding = List.copyOf(embedding);
        }
    }
}
