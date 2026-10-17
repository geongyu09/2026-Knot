package com.knot.backend.recording.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import ch.qos.logback.classic.Level;
import com.knot.backend.global.exception.GlobalExceptionHandler;
import com.knot.backend.recording.domain.RecordingSession;
import com.knot.backend.recording.domain.RecordingException;
import com.knot.backend.recording.domain.RecordingErrorCode;
import com.knot.backend.testsupport.LogCapture;
import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataIntegrityViolationException;

class RecordingSessionRepositoryDiagnosticsTest {

    @ParameterizedTest
    @ValueSource(strings = {"uk_recording_sessions_member_active", "uk_recording_sessions_member_request", "unknown"})
    @DisplayName("녹음 DB 변환은 원인을 보존하며 알려진 충돌과 예상 밖 무결성 실패를 구분한다")
    void save_failure_preservesCauseAndClassifiesConflict(String constraint) {
        RecordingSessionJpaRepository recordingSessionJpaRepository = mock(RecordingSessionJpaRepository.class);
        RecordingSession session = mock(RecordingSession.class);
        ConstraintViolationException violation = new ConstraintViolationException(
                "private-constraint",
                new java.sql.SQLException("private-sql"),
                constraint
        );
        DataIntegrityViolationException original = new DataIntegrityViolationException(
                "private-sql",
                violation
        );
        when(recordingSessionJpaRepository.saveAndFlush(session)).thenThrow(original);
        Throwable thrown = catchThrowable(
                () -> new RecordingSessionRepositoryAdapter(recordingSessionJpaRepository).save(session)
        );
        assertThat(thrown).isInstanceOf(RecordingException.class)
                .hasCause(original);
        RecordingException converted = RecordingException.class.cast(thrown);
        assertThat(converted.getErrorCode()).isEqualTo(expectedCode(constraint));
        try (LogCapture logs = new LogCapture(GlobalExceptionHandler.class)) {
            new GlobalExceptionHandler().handleProjectException(converted);
            assertDiagnostic(
                    logs,
                    constraint
            );
        }
    }

    private RecordingErrorCode expectedCode(String constraint) {
        if ("uk_recording_sessions_member_active".equals(constraint)) {
            return RecordingErrorCode.ACTIVE_RECORDING_ALREADY_EXISTS;
        }
        if ("uk_recording_sessions_member_request".equals(constraint)) {
            return RecordingErrorCode.RECORDING_START_REQUEST_CONFLICT;
        }
        return RecordingErrorCode.INVALID_RECORDING_DATA;
    }

    private void assertDiagnostic(
            LogCapture logs,
            String constraint
    ) {
        if (!"unknown".equals(constraint)) {
            assertThat(logs.events()).isEmpty();
            return;
        }
        assertThat(logs.events()).singleElement()
                .satisfies(event -> {
                    assertThat(event.getLevel()).isEqualTo(Level.ERROR);
                    assertThat(event.getFormattedMessage()).contains("DataIntegrityViolationException")
                            .doesNotContain("private-sql");
                });
    }
}
