package com.knot.backend.recording.infrastructure;

import com.knot.backend.recording.domain.Transcript;
import com.knot.backend.recording.domain.TranscriptRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class TranscriptRepositoryAdapter implements TranscriptRepository {
    private final TranscriptJpaRepository transcripts;

    @Override
    public Transcript saveAndFlush(Transcript transcript) {
        return transcripts.saveAndFlush(transcript);
    }
}
