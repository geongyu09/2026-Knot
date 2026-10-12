package com.knot.backend.recording.infrastructure.scheduling;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import com.knot.backend.recording.application.RecordingConnectionExpiryService;
import java.time.Duration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RecordingConnectionExpirySchedulerTest {

    @Test
    @DisplayName("주기 작업은 설정한 개수만큼 자동 종료 회수를 요청한다")
    void expireDueRecordings_success_usesConfiguredBatchSize() {
        // given
        RecordingConnectionExpiryService expiryService = mock(RecordingConnectionExpiryService.class);
        RecordingConnectionExpiryScheduler scheduler = new RecordingConnectionExpiryScheduler(
                expiryService,
                new RecordingConnectionExpiryProperties(
                        true,
                        Duration.ofSeconds(1),
                        100
                )
        );

        // when
        scheduler.expireDueRecordings();

        // then
        verify(expiryService).expireDue(100);
    }
}
