package com.knot.backend.document.application;

import com.knot.backend.document.application.dto.result.DocumentGenerationProgressResult;
import com.knot.backend.document.application.dto.result.DocumentGenerationSummaryResult;
import com.knot.backend.document.domain.DocumentGenerationBatchRepository;
import com.knot.backend.document.domain.DocumentGenerationJobRepository;
import com.knot.backend.document.domain.DocumentGenerationJob;
import java.time.Instant;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;

@Service
@RequiredArgsConstructor
public class DocumentGenerationProgressService {
    private final DocumentGenerationBatchRepository batches;
    private final DocumentGenerationJobRepository jobs;

    @Transactional(readOnly = true)
    public Optional<DocumentGenerationProgressResult> findProgress(
            long workspaceId,
            long recordingSessionId
    ) {
        return batches.findByWorkspaceIdAndRecordingSessionId(
                workspaceId,
                recordingSessionId
        )
                .map(DocumentGenerationProgressResult::from);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Optional<DocumentGenerationSummaryResult> findSummary(
            long workspaceId,
            long recordingSessionId,
            Instant now
    ) {
        return batches.findByWorkspaceIdAndRecordingSessionId(
                workspaceId,
                recordingSessionId
        )
                .map(
                        batch -> new DocumentGenerationSummaryResult(
                                batch.getProcessingStatus(),
                                batch.getSucceededCount(),
                                jobs.findAllByBatchId(batch.getId())
                                        .stream()
                                        .filter(DocumentGenerationJob::isFailed)
                                        .filter(job -> !job.isRetentionExpired(now))
                                        .map(DocumentGenerationJob::getId)
                                        .toList()
                        )
                );
    }
}
