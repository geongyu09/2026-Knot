package com.knot.backend.recording.application;

import com.knot.backend.recording.domain.RecordingSession;
import com.knot.backend.recording.domain.RecordingSessionRepository;
import java.time.Clock;
import java.time.Instant;
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
    private final RecordingConnectionExpiryTransaction expiryTransaction;
    private final Clock clock;

    public int expireDisconnected(int batchSize) {
        Instant threshold = RecordingSession.disconnectionThreshold(
                clock.instant()
                        .truncatedTo(ChronoUnit.MICROS)
        );
        List<Long> candidateIds = recordingSessionRepository.findActiveIdsLastSeenAtOrBefore(
                threshold,
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
            return expiryTransaction.expire(recordingId);
        } catch (RuntimeException exception) {
            log.warn(
                    "녹음 연결 만료 회수에 실패했습니다. recordingId={}",
                    recordingId,
                    exception
            );
            return false;
        }
    }
}
