package com.knot.backend.recording.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.knot.backend.recording.application.dto.result.AiTranscript;
import com.knot.backend.recording.application.dto.result.AiTranscriptionJob;
import com.knot.backend.recording.application.dto.result.RecordingTranscriptionExecution;
import com.knot.backend.recording.application.dto.result.RecordingTranscriptionRetryResult;
import com.knot.backend.recording.domain.RecordingErrorCode;
import com.knot.backend.recording.domain.TranscriptionErrorCode;
import com.knot.backend.recording.domain.TranscriptionException;
import com.knot.backend.recording.domain.TranscriptionStatus;
import com.knot.backend.global.config.TranscriptionProperties;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class RecordingTranscriptionServiceTest {
    private static final Instant NOW = Instant.parse("2026-10-13T00:00:00Z");
    private static final UUID ATTEMPT = UUID.fromString("019bbbc0-51ae-7000-8000-000000000001");

    @Mock
    private RecordingTranscriptionStateService state;
    @Mock
    private TranscriptionClient client;
    @Mock
    private RecordingAudioStorage storage;
    private RecordingTranscriptionService service;

    @AfterEach
    void closeWorker() {
        if (service != null) {
            service.close();
        }
    }

    @Test
    @DisplayName("전사 기능이 비활성화되어도 시작 시 기존 진행 작업을 복구한다")
    void initialize_success_disabledRecovery() {
        // given
        service = service(false);

        // when
        service.initialize();

        // then
        verify(state).recoverProcessing();
        verify(
                state,
                never()
        ).findProcessing();
        verifyNoInteractions(
                client,
                storage
        );
    }

    @Test
    @DisplayName("비활성화된 기능은 worker를 실행하지 않는다")
    void dispatch_success_disabled() {
        // given
        service = service(false);

        // when
        service.dispatch();

        // then
        verifyNoInteractions(
                state,
                client,
                storage
        );
    }

    @Test
    @DisplayName("종료된 서비스는 새로운 worker를 실행하지 않는다")
    void dispatch_success_closed() {
        // given
        service = service(true);
        service.close();

        // when
        service.dispatch();

        // then
        verifyNoInteractions(
                state,
                client,
                storage
        );
    }

    @Test
    @DisplayName("복구 트랜잭션 실패는 준비되지 않은 서버의 시작을 막는다")
    void initialize_failure_recoveryStorage() {
        // given
        service = service(true);
        doThrow(new IllegalStateException("database unavailable")).when(state)
                .recoverProcessing();

        // when
        Throwable thrown = catchThrowable(service::initialize);

        // then
        assertThat(thrown).isInstanceOf(IllegalStateException.class);
        verifyNoInteractions(
                client,
                storage
        );
    }

    @Test
    @DisplayName("전사 결과 저장과 문서 접수가 완료된 후에만 다음 작업을 찾는다")
    void dispatch_success_persistenceBeforeNextSubmission() {
        // given
        RecordingTranscriptionExecution execution = prepare();
        when(
                client.submit(
                        ATTEMPT,
                        "https://immutable.example/audio",
                        null
                )
        ).thenReturn(succeeded(ATTEMPT));
        when(
                state.complete(
                        execution,
                        transcript()
                )
        ).thenReturn(true);
        service = service(true);

        // when
        service.dispatch();

        // then
        verify(
                state,
                timeout(2000).times(2)
        ).findProcessing();
        InOrder order = inOrder(
                state,
                storage,
                client
        );
        order.verify(state)
                .findProcessing();
        order.verify(storage)
                .presignDownload(
                        "recording.webm",
                        "audio/webm",
                        100
                );
        order.verify(client)
                .submit(
                        ATTEMPT,
                        "https://immutable.example/audio",
                        null
                );
        order.verify(state)
                .complete(
                        execution,
                        transcript()
                );
        order.verify(state)
                .findProcessing();
    }

    @Test
    @DisplayName("중복 dispatch 호출은 기존 worker를 재실행하지 않는다")
    void dispatch_success_duplicateWhileRunning() throws Exception {
        // given
        RecordingTranscriptionExecution execution = prepare();
        CountDownLatch submitted = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(
                client.submit(
                        ATTEMPT,
                        "https://immutable.example/audio",
                        null
                )
        ).thenAnswer(invocation -> {
            submitted.countDown();
            release.await(
                    2,
                    TimeUnit.SECONDS
            );
            return succeeded(ATTEMPT);
        });
        when(
                state.complete(
                        execution,
                        transcript()
                )
        ).thenReturn(true);
        service = service(true);

        service.dispatch();
        assertThat(
                submitted.await(
                        2,
                        TimeUnit.SECONDS
                )
        ).isTrue();

        // when
        service.dispatch();

        // then
        release.countDown();
        verify(
                state,
                timeout(2000)
        ).complete(
                execution,
                transcript()
        );
        verify(client).submit(
                ATTEMPT,
                "https://immutable.example/audio",
                null
        );
    }

    @ParameterizedTest
    @EnumSource(value = TranscriptionErrorCode.class, names = {"AI_TIMEOUT", "AI_UNAVAILABLE"})
    @DisplayName("접수 응답만 유실되면 같은 ID를 조회하고 POST를 반복하지 않는다")
    void dispatch_success_lostSubmitResponse(TranscriptionErrorCode errorCode) {
        // given
        RecordingTranscriptionExecution execution = prepare();
        when(
                client.submit(
                        ATTEMPT,
                        "https://immutable.example/audio",
                        null
                )
        ).thenThrow(new TranscriptionException(errorCode));
        when(client.get(ATTEMPT)).thenReturn(succeeded(ATTEMPT));
        when(
                state.complete(
                        execution,
                        transcript()
                )
        ).thenReturn(true);
        service = service(true);

        // when
        service.dispatch();

        // then
        verify(
                state,
                timeout(2000)
        ).complete(
                execution,
                transcript()
        );
        verify(client).submit(
                ATTEMPT,
                "https://immutable.example/audio",
                null
        );
        verify(client).get(ATTEMPT);
    }

    @Test
    @DisplayName("접수 여부 확인 조회도 유실되면 자동 접수 재시도 없이 실패를 저장한다")
    void dispatch_failure_confirmationLost() {
        // given
        RecordingTranscriptionExecution execution = prepare();
        when(
                client.submit(
                        ATTEMPT,
                        "https://immutable.example/audio",
                        null
                )
        ).thenThrow(new TranscriptionException(TranscriptionErrorCode.AI_TIMEOUT));
        when(client.get(ATTEMPT)).thenThrow(new TranscriptionException(TranscriptionErrorCode.AI_JOB_NOT_FOUND));
        when(
                state.fail(
                        execution,
                        "AI_JOB_NOT_FOUND"
                )
        ).thenReturn(true);
        service = service(true);

        // when
        service.dispatch();

        // then
        verify(
                state,
                timeout(2000)
        ).fail(
                execution,
                "AI_JOB_NOT_FOUND"
        );
        verify(client).submit(
                ATTEMPT,
                "https://immutable.example/audio",
                null
        );
    }

    @Test
    @DisplayName("진행 중 작업을 조회하여 성공 결과를 저장한다")
    void dispatch_success_polling() {
        // given
        RecordingTranscriptionExecution execution = prepare();
        when(
                client.submit(
                        ATTEMPT,
                        "https://immutable.example/audio",
                        null
                )
        ).thenReturn(processing());
        when(client.get(ATTEMPT)).thenReturn(
                processing(),
                succeeded(ATTEMPT)
        );
        when(
                state.complete(
                        execution,
                        transcript()
                )
        ).thenReturn(true);
        service = service(true);

        // when
        service.dispatch();

        // then
        verify(
                state,
                timeout(2000)
        ).complete(
                execution,
                transcript()
        );
        verify(
                client,
                org.mockito.Mockito.times(2)
        ).get(ATTEMPT);
    }

    @Test
    @DisplayName("DB 시작 시각으로 계산한 기한이 지난 작업은 모델을 다시 접수하지 않는다")
    void dispatch_failure_jobDeadline() {
        // given
        RecordingTranscriptionExecution execution = execution(
                ATTEMPT,
                NOW.minus(Duration.ofHours(13))
        );
        when(state.findProcessing()).thenReturn(
                Optional.of(execution),
                Optional.empty()
        );
        when(
                state.fail(
                        execution,
                        "AI_TIMEOUT"
                )
        ).thenReturn(true);
        service = service(true);

        // when
        service.dispatch();

        // then
        verify(
                state,
                timeout(2000)
        ).fail(
                execution,
                "AI_TIMEOUT"
        );
        verifyNoInteractions(
                client,
                storage
        );
    }

    @Test
    @DisplayName("AI 작업 실패를 정적 코드로 저장하고 전사 결과는 저장하지 않는다")
    void dispatch_failure_remoteJob() {
        // given
        RecordingTranscriptionExecution execution = prepare();
        when(
                client.submit(
                        ATTEMPT,
                        "https://immutable.example/audio",
                        null
                )
        ).thenReturn(
                new AiTranscriptionJob(
                        ATTEMPT,
                        AiTranscriptionJob.Status.FAILED,
                        "STT_FAILED",
                        null
                )
        );
        when(
                state.fail(
                        execution,
                        "STT_FAILED"
                )
        ).thenReturn(true);
        service = service(true);

        // when
        service.dispatch();

        // then
        verify(
                state,
                timeout(2000)
        ).fail(
                execution,
                "STT_FAILED"
        );
        verify(
                state,
                never()
        ).complete(
                any(),
                any()
        );
    }

    @Test
    @DisplayName("결과 저장 실패 후 실패 상태 저장이 성공하면 실행 슬롯을 비운다")
    void dispatch_failure_resultStorage() {
        // given
        RecordingTranscriptionExecution execution = prepare();
        when(
                client.submit(
                        ATTEMPT,
                        "https://immutable.example/audio",
                        null
                )
        ).thenReturn(succeeded(ATTEMPT));
        when(
                state.complete(
                        execution,
                        transcript()
                )
        ).thenThrow(new IllegalStateException("storage failure"));
        when(
                state.fail(
                        execution,
                        "RESULT_STORAGE_FAILED"
                )
        ).thenReturn(true);
        service = service(true);

        // when
        service.dispatch();

        // then
        verify(
                state,
                timeout(2000).times(2)
        ).findProcessing();
        verify(state).fail(
                execution,
                "RESULT_STORAGE_FAILED"
        );
    }

    @Test
    @DisplayName("결과와 실패 상태를 모두 저장하지 못하면 다음 제출을 차단한다")
    void dispatch_failure_storageKeepsSlot() throws Exception {
        // given
        RecordingTranscriptionExecution execution = prepare();
        CountDownLatch failedPersistence = new CountDownLatch(1);
        when(
                client.submit(
                        ATTEMPT,
                        "https://immutable.example/audio",
                        null
                )
        ).thenReturn(succeeded(ATTEMPT));
        when(
                state.complete(
                        execution,
                        transcript()
                )
        ).thenThrow(new IllegalStateException("storage failure"));
        when(
                state.fail(
                        execution,
                        "RESULT_STORAGE_FAILED"
                )
        ).thenAnswer(invocation -> {
            failedPersistence.countDown();
            throw new IllegalStateException("storage still unavailable");
        });
        service = service(true);

        service.dispatch();
        assertThat(
                failedPersistence.await(
                        2,
                        TimeUnit.SECONDS
                )
        ).isTrue();

        // when
        service.dispatch();

        // then
        verify(state).findProcessing();
        verify(client).submit(
                ATTEMPT,
                "https://immutable.example/audio",
                null
        );
    }

    @Test
    @DisplayName("종료는 폴링을 중단하고 중단 상태를 저장한 뒤 다음 접수를 차단한다")
    void close_success_interruptWorker() throws Exception {
        // given
        RecordingTranscriptionExecution execution = prepare();
        CountDownLatch submitted = new CountDownLatch(1);
        when(
                client.submit(
                        ATTEMPT,
                        "https://immutable.example/audio",
                        null
                )
        ).thenAnswer(invocation -> {
            submitted.countDown();
            return processing();
        });
        when(
                state.fail(
                        execution,
                        "AI_INTERRUPTED"
                )
        ).thenReturn(true);
        service = new RecordingTranscriptionService(
                state,
                properties(
                        true,
                        Duration.ofHours(1)
                ),
                client,
                storage,
                clock()
        );

        service.dispatch();
        assertThat(
                submitted.await(
                        2,
                        TimeUnit.SECONDS
                )
        ).isTrue();

        // when
        service.close();

        // then
        verify(state).fail(
                execution,
                "AI_INTERRUPTED"
        );
        verify(state).findProcessing();
        verify(
                client,
                never()
        ).get(any());
    }

    @Test
    @DisplayName("사용자 재시도는 DB 예약을 커밋한 뒤 worker를 실행한다")
    void retry_success() {
        // given
        RecordingTranscriptionExecution execution = prepare();
        RecordingTranscriptionRetryResult expected = new RecordingTranscriptionRetryResult(
                2,
                ATTEMPT,
                TranscriptionStatus.PROCESSING
        );
        when(
                state.retry(
                        1,
                        3,
                        2
                )
        ).thenReturn(expected);
        when(
                client.submit(
                        ATTEMPT,
                        "https://immutable.example/audio",
                        null
                )
        ).thenReturn(succeeded(ATTEMPT));
        when(
                state.complete(
                        execution,
                        transcript()
                )
        ).thenReturn(true);
        service = service(true);

        // when
        RecordingTranscriptionRetryResult result = service.retry(
                1,
                3,
                2
        );

        // then
        assertThat(result).isEqualTo(expected);
        verify(
                state,
                timeout(2000)
        ).complete(
                execution,
                transcript()
        );
        InOrder order = inOrder(
                state,
                client
        );
        order.verify(state)
                .retry(
                        1,
                        3,
                        2
                );
        order.verify(state)
                .findProcessing();
        order.verify(client)
                .submit(
                        ATTEMPT,
                        "https://immutable.example/audio",
                        null
                );
    }

    @Test
    @DisplayName("이전 worker가 슬롯을 해제하기 직전 예약된 재시도도 이어서 실행한다")
    void retry_success_reservationBeforeSlotRelease() {
        // given
        RecordingTranscriptionExecution first = execution(
                ATTEMPT,
                NOW
        );
        UUID nextId = UUID.fromString("019bbbc0-51ae-7000-8000-000000000002");
        RecordingTranscriptionExecution next = execution(
                nextId,
                NOW
        );
        when(state.findProcessing()).thenReturn(
                Optional.of(first),
                Optional.of(next),
                Optional.empty()
        );
        when(
                storage.presignDownload(
                        "recording.webm",
                        "audio/webm",
                        100
                )
        ).thenReturn("https://immutable.example/audio");
        when(
                client.submit(
                        ATTEMPT,
                        "https://immutable.example/audio",
                        null
                )
        ).thenReturn(succeeded(ATTEMPT));
        when(
                client.submit(
                        nextId,
                        "https://immutable.example/audio",
                        null
                )
        ).thenReturn(succeeded(nextId));
        when(
                state.retry(
                        1,
                        3,
                        2
                )
        ).thenReturn(
                new RecordingTranscriptionRetryResult(
                        2,
                        nextId,
                        TranscriptionStatus.PROCESSING
                )
        );
        when(
                state.complete(
                        next,
                        transcript()
                )
        ).thenReturn(true);
        when(
                state.complete(
                        first,
                        transcript()
                )
        ).thenAnswer(invocation -> {
            service.retry(
                    1,
                    3,
                    2
            );
            return true;
        });
        service = service(true);

        // when
        service.dispatch();

        // then
        verify(
                state,
                timeout(2000)
        ).complete(
                next,
                transcript()
        );
        verify(client).submit(
                ATTEMPT,
                "https://immutable.example/audio",
                null
        );
        verify(client).submit(
                nextId,
                "https://immutable.example/audio",
                null
        );
    }

    @Test
    @DisplayName("비활성화된 기능의 재시도는 DB 예약 전에 거절한다")
    void retry_failure_disabled() {
        // given
        service = service(false);

        // when
        Throwable thrown = catchThrowable(
                () -> service.retry(
                        1,
                        3,
                        2
                )
        );

        // then
        assertThat(thrown).hasMessage(RecordingErrorCode.TRANSCRIPTION_DISABLED.getMessage());
        verifyNoInteractions(
                state,
                client,
                storage
        );
    }

    @Test
    @DisplayName("종료 후 재시도 요청은 DB 예약 전에 거절한다")
    void retry_failure_closed() {
        // given
        service = service(true);
        service.close();

        // when
        Throwable thrown = catchThrowable(
                () -> service.retry(
                        1,
                        3,
                        2
                )
        );

        // then
        assertThat(thrown).hasMessage(TranscriptionErrorCode.AI_NOT_READY.getMessage());
        verifyNoInteractions(
                state,
                client,
                storage
        );
    }

    private RecordingTranscriptionExecution prepare() {
        RecordingTranscriptionExecution execution = execution(
                ATTEMPT,
                NOW
        );
        when(state.findProcessing()).thenReturn(
                Optional.of(execution),
                Optional.empty()
        );
        when(
                storage.presignDownload(
                        "recording.webm",
                        "audio/webm",
                        100
                )
        ).thenReturn("https://immutable.example/audio");
        return execution;
    }
    private RecordingTranscriptionExecution execution(
            UUID attemptId,
            Instant startedAt
    ) {
        return new RecordingTranscriptionExecution(
                1,
                2,
                attemptId,
                "recording.webm",
                "audio/webm",
                100,
                startedAt,
                NOW.minusSeconds(1)
        );
    }
    private AiTranscript transcript() {
        return new AiTranscript(
                1,
                "{\"transcription\":[]}",
                List.of(
                        new AiTranscript.Utterance(
                                0,
                                "화자 1",
                                0,
                                1,
                                "안녕하세요"
                        )
                )
        );
    }
    private AiTranscriptionJob succeeded(UUID attemptId) {
        return new AiTranscriptionJob(
                attemptId,
                AiTranscriptionJob.Status.SUCCEEDED,
                null,
                transcript()
        );
    }
    private AiTranscriptionJob processing() {
        return new AiTranscriptionJob(
                ATTEMPT,
                AiTranscriptionJob.Status.PROCESSING,
                null,
                null
        );
    }
    private RecordingTranscriptionService service(boolean enabled) {
        return new RecordingTranscriptionService(
                state,
                properties(
                        enabled,
                        Duration.ofMillis(2)
                ),
                client,
                storage,
                clock()
        );
    }
    private Clock clock() {
        return Clock.fixed(
                NOW,
                ZoneOffset.UTC
        );
    }
    private TranscriptionProperties properties(
            boolean enabled,
            Duration pollInterval
    ) {
        return new TranscriptionProperties(
                enabled,
                URI.create("http://localhost:18765"),
                "test-secret",
                Duration.ofSeconds(5),
                Duration.ofSeconds(30),
                pollInterval,
                Duration.ofHours(12)
        );
    }
}
