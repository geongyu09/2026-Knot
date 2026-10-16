package com.knot.backend.recording.application;

import com.knot.backend.global.logging.ServerErrorLogger;
import com.knot.backend.recording.domain.RecordingSessionRepository;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class RecordingConnectionExpiryService {
    private static final Logger log = LoggerFactory.getLogger(RecordingConnectionExpiryService.class);

    private final RecordingSessionRepository recordingSessionRepository;
    private final RecordingConnectionExpiryTransaction recordingConnectionExpiryTransaction;
    private final Clock clock;

    public int expireDue(int batchSize) {
        List<Long> candidateIds = recordingSessionRepository.findActiveIdsDueAt(
                clock.instant()
                        .truncatedTo(ChronoUnit.MICROS),
                batchSize
        );
        int expiredCount = 0;
        for (long recordingId : candidateIds) {
            if (expireIsolated(recordingId)) {
                expiredCount++;
            }
        }
        return expiredCount;
    }

    private boolean expireIsolated(long recordingId) {
        try {
            return recordingConnectionExpiryTransaction.expire(recordingId);
        } catch (RuntimeException exception) {
            ServerErrorLogger.record(
                    log,
                    "Recording expiry recordingId=" + recordingId + " phase=expire",
                    exception
            );
            return false;
        }
    }
}
