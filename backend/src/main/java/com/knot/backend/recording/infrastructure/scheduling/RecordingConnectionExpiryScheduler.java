package com.knot.backend.recording.infrastructure.scheduling;

import com.knot.backend.recording.application.RecordingConnectionExpiryService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;

@RequiredArgsConstructor
public class RecordingConnectionExpiryScheduler {
    private static final Logger log = LoggerFactory.getLogger(RecordingConnectionExpiryScheduler.class);

    private final RecordingConnectionExpiryService expiryService;
    private final RecordingConnectionExpiryProperties properties;

    @Scheduled(fixedDelayString = "${recording.connection-expiry.interval}")
    public void expireDueRecordings() {
        int expiredCount = expiryService.expireDue(properties.batchSize());
        if (expiredCount > 0) {
            log.info(
                    "자동 종료 시각이 지난 녹음 {}건을 종료했습니다",
                    expiredCount
            );
        }
    }
}
