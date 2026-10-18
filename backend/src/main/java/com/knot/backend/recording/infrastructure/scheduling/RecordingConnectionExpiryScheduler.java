package com.knot.backend.recording.infrastructure.scheduling;

import com.knot.backend.global.logging.ServerErrorLogger;
import com.knot.backend.recording.application.RecordingConnectionExpiryService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;

@RequiredArgsConstructor
public class RecordingConnectionExpiryScheduler {
    private static final Logger log = LoggerFactory.getLogger(RecordingConnectionExpiryScheduler.class);

    private final RecordingConnectionExpiryService recordingConnectionExpiryService;
    private final RecordingConnectionExpiryProperties recordingConnectionExpiryProperties;

    @Scheduled(fixedDelayString = "${recording.connection-expiry.interval}")
    public void expireDueRecordings() {
        int expiredCount;
        try {
            expiredCount = recordingConnectionExpiryService.expireDue(recordingConnectionExpiryProperties.batchSize());
        } catch (RuntimeException exception) {
            ServerErrorLogger.record(
                    log,
                    "Recording expiry phase=candidate-query",
                    exception
            );
            return;
        }
        if (expiredCount > 0) {
            log.info(
                    "자동 종료 시각이 지난 녹음 {}건을 종료했습니다",
                    expiredCount
            );
        }
    }
}
