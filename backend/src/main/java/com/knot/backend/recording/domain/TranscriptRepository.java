package com.knot.backend.recording.domain;

public interface TranscriptRepository {
    Transcript saveAndFlush(Transcript transcript);
}
