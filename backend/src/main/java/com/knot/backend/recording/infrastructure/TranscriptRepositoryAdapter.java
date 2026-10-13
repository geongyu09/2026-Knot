package com.knot.backend.recording.infrastructure;

import com.knot.backend.recording.domain.Transcript;
import com.knot.backend.recording.domain.TranscriptRepository;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class TranscriptRepositoryAdapter implements TranscriptRepository {
    private final EntityManager entityManager;

    @Override
    public Transcript saveAndFlush(Transcript transcript) {
        entityManager.persist(transcript);
        entityManager.flush();
        return transcript;
    }
}
