package com.knot.backend.recording.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.knot.backend.document.DocumentFixtures;
import com.knot.backend.recording.application.dto.result.StoredAudioObject;
import com.knot.backend.recording.application.dto.result.RecordingTranscriptionExecution;
import com.knot.backend.recording.domain.RecordingAudioUpload;
import com.knot.backend.recording.domain.RecordingAudioUploadRepository;
import com.knot.backend.recording.domain.TranscriptionStatus;
import com.knot.backend.testsupport.TestApplicationProperties;
import com.knot.backend.testsupport.TestcontainersConfiguration;
import java.time.Clock;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.support.TransactionTemplate;

@Tag("integration")
@SpringBootTest(properties = {"knot.transcription.enabled=true", "knot.transcription.token=test-token"})
@Import(TestcontainersConfiguration.class)
@TestApplicationProperties
class RecordingTranscriptionCompletionIntegrationTest {
    private static final Instant NOW = DocumentFixtures.CREATED_AT.plusSeconds(120);

    @Autowired
    private RecordingAudioUploadCompletionService completion;
    @Autowired
    private RecordingAudioUploadRepository uploads;
    @Autowired
    private TransactionTemplate transactions;
    @Autowired
    private JdbcClient jdbc;
    @MockitoSpyBean
    private RecordingTranscriptionStateService state;
    @MockitoBean
    private RecordingTranscriptionService worker;
    @MockitoBean
    private RecordingAudioStorage storage;
    @MockitoBean
    private Clock clock;
    private long workspaceId;
    private long memberId;
    private long recordingId;
    private long uploadId;

    @BeforeEach
    void setUp() {
        when(clock.instant()).thenReturn(NOW);
        jdbc.sql("TRUNCATE TABLE members, workspaces RESTART IDENTITY CASCADE")
                .update();
        DocumentFixtures fixtures = new DocumentFixtures(jdbc);
        workspaceId = fixtures.saveWorkspace();
        memberId = fixtures.saveMember("녹음자");
        fixtures.join(
                workspaceId,
                memberId
        );
        recordingId = fixtures.saveRecording(
                workspaceId,
                memberId,
                1000
        );
        uploadId = transactions.execute(
                status -> uploads.save(
                        RecordingAudioUpload.reserve(
                                recordingId,
                                "recordings/" + recordingId + "/audio",
                                "audio/webm",
                                1024,
                                NOW.minusSeconds(10)
                        )
                )
                        .getId()
        );
        when(storage.findStoredObject(any())).thenReturn(
                StoredAudioObject.of(
                        1024,
                        "audio/webm"
                )
        );
    }

    @Test
    @DisplayName("업로드 완료와 전사 접수를 함께 확정한 뒤 작업 실행을 요청한다")
    void completeRegistersAttemptBeforeDispatch() {
        // given
        assertThat(state.find(recordingId)).isNull();

        // when
        completion.complete(
                workspaceId,
                memberId,
                recordingId,
                uploadId
        );

        // then
        assertThat(
                state.find(recordingId)
                        .status()
        ).isEqualTo(TranscriptionStatus.PROCESSING);
        assertThat(
                uploads.findById(uploadId)
                        .orElseThrow()
                        .isCompleted()
        ).isTrue();
        verify(worker).dispatch();
    }

    @Test
    @DisplayName("실패한 전사는 완료 통지를 반복해도 같은 시도로 남는다")
    void repeatedCompletionDoesNotRetryFailedAttempt() {
        // given
        completion.complete(
                workspaceId,
                memberId,
                recordingId,
                uploadId
        );
        RecordingTranscriptionExecution execution = state.findProcessing()
                .orElseThrow();
        state.fail(
                execution,
                "AI_UNAVAILABLE"
        );

        // when
        completion.complete(
                workspaceId,
                memberId,
                recordingId,
                uploadId
        );

        // then
        assertThat(
                state.find(recordingId)
                        .attemptId()
        ).isEqualTo(execution.attemptId());
        assertThat(
                state.find(recordingId)
                        .status()
        ).isEqualTo(TranscriptionStatus.FAILED);
        assertThat(state.findProcessing()).isEmpty();
    }

    @Test
    @DisplayName("전사 접수 저장에 실패하면 업로드 완료도 롤백한다")
    void registrationFailureRollsBackCompletion() {
        // given
        transactions.executeWithoutResult(
                status -> doThrow(new IllegalStateException("테스트 저장 실패")).when(state)
                        .registerAutomatic(
                                anyLong(),
                                any()
                        )
        );

        // when
        Throwable failure = org.assertj.core.api.Assertions.catchThrowable(
                () -> completion.complete(
                        workspaceId,
                        memberId,
                        recordingId,
                        uploadId
                )
        );

        // then
        assertThat(failure).isInstanceOf(IllegalStateException.class);
        assertThat(
                uploads.findById(uploadId)
                        .orElseThrow()
                        .isCompleted()
        ).isFalse();
        assertThat(state.find(recordingId)).isNull();
    }
}
