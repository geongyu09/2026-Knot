package com.knot.backend.recording.infrastructure.persistence;

import com.knot.backend.recording.domain.model.Transcript;
import com.knot.backend.recording.domain.repository.TranscriptRepository;
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
