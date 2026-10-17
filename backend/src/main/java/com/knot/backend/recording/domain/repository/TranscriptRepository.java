package com.knot.backend.recording.domain.repository;

import com.knot.backend.recording.domain.model.Transcript;

public interface TranscriptRepository {
    Transcript saveAndFlush(Transcript transcript);
}
