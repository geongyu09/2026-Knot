package com.knot.backend.recording.application.dto.result;

import java.util.List;

public record AiTranscript(
        int schemaVersion,
        String rawWhisperJson,
        List<Utterance> utterances
) {
    public AiTranscript {
        utterances = List.copyOf(utterances);
    }
    public record Utterance(
            int ord,
            String speakerLabel,
            double startSec,
            double endSec,
            String text
    ) {
    }
}
