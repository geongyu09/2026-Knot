package com.knot.backend.recording.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import com.knot.backend.global.config.TranscriptionProperties;
import com.knot.backend.recording.application.dto.result.AiTranscript;
import com.knot.backend.recording.application.dto.result.AiTranscriptionJob;
import com.knot.backend.recording.application.dto.result.RecordingTranscriptionExecution;
import com.knot.backend.recording.domain.RecordingErrorCode;
import com.knot.backend.recording.domain.RecordingException;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class RecordingTranscriptionServiceTest {
    private static final Instant NOW = Instant.parse("2026-10-13T00:00:00Z");
    private static final UUID ATTEMPT = UUID.fromString("019bbbc0-51ae-7000-8000-000000000001");

    @Mock
    private RecordingTranscriptionStateService recordingTranscriptionStateService;
    @Mock
    private TranscriptionClient transcriptionClient;
    @Mock
    private RecordingAudioStorage recordingAudioStorage;
    private RecordingTranscriptionService service;

    @AfterEach
    void closeWorker() {
        if (service != null) {
            service.close();
        }
    }

    @Test
    @DisplayName("비활성 상태에서는 AI 작업을 시작하지 않는다")
    void disabledDoesNotDispatch() {
        // given
        service = service(false);

        // when
        service.dispatch();

        // then
        verifyNoInteractions(
                recordingTranscriptionStateService,
                transcriptionClient,
                recordingAudioStorage
        );
    }

    @Test
    @DisplayName("기존 worker가 실행 중이면 같은 작업을 다시 접수하지 않는다")
    void duplicateDispatchDoesNotSubmitAgain() throws Exception {
        // given
        RecordingTranscriptionExecution execution = prepare();
        CountDownLatch submitted = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(
                transcriptionClient.submit(
                        ATTEMPT,
                        "https://immutable.example/audio"
                )
        ).thenAnswer(call -> {
            submitted.countDown();
            release.await(
                    2,
                    TimeUnit.SECONDS
            );
            return succeeded(ATTEMPT);
        });
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
                recordingTranscriptionStateService,
                timeout(2000)
        ).complete(
                execution,
                transcript()
        );
        verify(transcriptionClient).submit(
                ATTEMPT,
                "https://immutable.example/audio"
        );
        verify(recordingTranscriptionStateService).findProcessing();
    }

    @ParameterizedTest
    @EnumSource(value = RecordingErrorCode.class, names = {"AI_TIMEOUT", "AI_UNAVAILABLE"})
    @DisplayName("POST 응답 유실은 같은 ID를 조회해 확인하고 POST를 반복하지 않는다")
    void lostPostResponseConfirmsSameAttempt(RecordingErrorCode code) {
        // given
        RecordingTranscriptionExecution execution = prepare();
        when(
                transcriptionClient.submit(
                        ATTEMPT,
                        "https://immutable.example/audio"
                )
        ).thenThrow(new RecordingException(code));
        when(transcriptionClient.get(ATTEMPT)).thenReturn(succeeded(ATTEMPT));
        service = service(true);

        // when
        service.dispatch();

        // then
        verify(
                recordingTranscriptionStateService,
                timeout(2000)
        ).complete(
                execution,
                transcript()
        );
        verify(transcriptionClient).submit(
                ATTEMPT,
                "https://immutable.example/audio"
        );
        verify(transcriptionClient).get(ATTEMPT);
    }

    @Test
    @DisplayName("접수 확인 조회도 실패하면 새 접수 없이 실패를 기록한다")
    void lostConfirmationFailsAttempt() {
        // given
        RecordingTranscriptionExecution execution = prepare();
        when(
                transcriptionClient.submit(
                        ATTEMPT,
                        "https://immutable.example/audio"
                )
        ).thenThrow(new RecordingException(RecordingErrorCode.AI_TIMEOUT));
        when(transcriptionClient.get(ATTEMPT)).thenThrow(new RecordingException(RecordingErrorCode.AI_JOB_NOT_FOUND));
        service = service(true);

        // when
        service.dispatch();

        // then
        verify(
                recordingTranscriptionStateService,
                timeout(2000)
        ).fail(
                execution,
                "AI_JOB_NOT_FOUND"
        );
        verify(transcriptionClient).submit(
                ATTEMPT,
                "https://immutable.example/audio"
        );
    }

    @Test
    @DisplayName("처리 중인 같은 시도를 조회해 성공 결과를 저장한다")
    void processingPollsUntilSucceeded() {
        // given
        RecordingTranscriptionExecution execution = prepare();
        when(
                transcriptionClient.submit(
                        ATTEMPT,
                        "https://immutable.example/audio"
                )
        ).thenReturn(processing());
        when(transcriptionClient.get(ATTEMPT)).thenReturn(succeeded(ATTEMPT));
        service = service(true);

        // when
        service.dispatch();

        // then
        verify(
                recordingTranscriptionStateService,
                timeout(2000)
        ).complete(
                execution,
                transcript()
        );
        verify(transcriptionClient).get(ATTEMPT);
    }

    @Test
    @DisplayName("접수 기한이 지난 작업은 AI에 제출하지 않는다")
    void expiredAttemptDoesNotSubmit() {
        // given
        RecordingTranscriptionExecution execution = execution(
                ATTEMPT,
                NOW.minusSeconds(100)
        );
        when(recordingTranscriptionStateService.findProcessing()).thenReturn(Optional.of(execution));
        service = service(true);

        // when
        service.dispatch();

        // then
        verify(
                recordingTranscriptionStateService,
                timeout(2000)
        ).fail(
                execution,
                "AI_TIMEOUT"
        );
        verifyNoInteractions(
                transcriptionClient,
                recordingAudioStorage
        );
    }

    @Test
    @DisplayName("AI 실패는 실패 코드만 저장하고 원문을 저장하지 않는다")
    void remoteFailureDoesNotSaveTranscript() {
        // given
        RecordingTranscriptionExecution execution = prepare();
        when(
                transcriptionClient.submit(
                        ATTEMPT,
                        "https://immutable.example/audio"
                )
        ).thenReturn(
                new AiTranscriptionJob(
                        ATTEMPT,
                        AiTranscriptionJob.Status.FAILED,
                        "STT_FAILED",
                        null
                )
        );
        service = service(true);

        // when
        service.dispatch();

        // then
        verify(
                recordingTranscriptionStateService,
                timeout(2000)
        ).fail(
                execution,
                "STT_FAILED"
        );
        verify(
                recordingTranscriptionStateService,
                never()
        ).complete(
                any(),
                any()
        );
    }

    @Test
    @DisplayName("결과 저장 실패를 실패 상태로 확정한 뒤 슬롯을 비운다")
    void failedResultStorageReleasesSlotAfterFailureCommit() {
        // given
        RecordingTranscriptionExecution execution = prepare();
        when(
                transcriptionClient.submit(
                        ATTEMPT,
                        "https://immutable.example/audio"
                )
        ).thenReturn(succeeded(ATTEMPT));
        doThrow(new IllegalStateException("테스트 저장 실패")).when(recordingTranscriptionStateService)
                .complete(
                        execution,
                        transcript()
                );
        service = service(true);
        service.dispatch();
        verify(
                recordingTranscriptionStateService,
                timeout(2000)
        ).fail(
                execution,
                "RESULT_STORAGE_FAILED"
        );

        // when
        service.dispatch();

        // then
        verify(
                recordingTranscriptionStateService,
                times(2)
        ).findProcessing();
        verify(transcriptionClient).submit(
                ATTEMPT,
                "https://immutable.example/audio"
        );
    }

    @Test
    @DisplayName("결과와 실패 상태를 모두 저장하지 못하면 슬롯을 유지한다")
    void failedTerminalStorageKeepsSlot() throws Exception {
        // given
        RecordingTranscriptionExecution execution = prepare();
        CountDownLatch failed = new CountDownLatch(1);
        when(
                transcriptionClient.submit(
                        ATTEMPT,
                        "https://immutable.example/audio"
                )
        ).thenReturn(succeeded(ATTEMPT));
        doThrow(new IllegalStateException("테스트 결과 저장 실패")).when(recordingTranscriptionStateService)
                .complete(
                        execution,
                        transcript()
                );
        doAnswer(call -> {
            failed.countDown();
            throw new IllegalStateException("테스트 실패 상태 저장 실패");
        }).when(recordingTranscriptionStateService)
                .fail(
                        execution,
                        "RESULT_STORAGE_FAILED"
                );
        service = service(true);
        service.dispatch();
        assertThat(
                failed.await(
                        2,
                        TimeUnit.SECONDS
                )
        ).isTrue();

        // when
        service.dispatch();

        // then
        verify(recordingTranscriptionStateService).findProcessing();
        verify(transcriptionClient).submit(
                ATTEMPT,
                "https://immutable.example/audio"
        );
    }

    @Test
    @DisplayName("종료하면 polling을 중단하고 중단 상태를 저장한다")
    void shutdownInterruptsPolling() throws Exception {
        // given
        RecordingTranscriptionExecution execution = prepare();
        CountDownLatch submitted = new CountDownLatch(1);
        when(
                transcriptionClient.submit(
                        ATTEMPT,
                        "https://immutable.example/audio"
                )
        ).thenAnswer(call -> {
            submitted.countDown();
            return processing();
        });
        service = new RecordingTranscriptionService(
                recordingTranscriptionStateService,
                properties(
                        true,
                        Duration.ofHours(1)
                ),
                transcriptionClient,
                recordingAudioStorage,
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
        verify(recordingTranscriptionStateService).fail(
                execution,
                "AI_INTERRUPTED"
        );
        verify(
                transcriptionClient,
                never()
        ).get(any());
    }

    @Test
    @DisplayName("이전 DB 확정과 경합하는 다음 dispatch도 결과를 덮어쓰지 않고 실행한다")
    void concurrentDispatchWaitsForTerminalCommit() throws Exception {
        // given
        RecordingTranscriptionExecution first = prepare();
        UUID nextId = UUID.randomUUID();
        RecordingTranscriptionExecution next = execution(
                nextId,
                NOW
        );
        when(recordingTranscriptionStateService.findProcessing()).thenReturn(
                Optional.of(first),
                Optional.of(next),
                Optional.empty()
        );
        when(
                transcriptionClient.submit(
                        ATTEMPT,
                        "https://immutable.example/audio"
                )
        ).thenReturn(succeeded(ATTEMPT));
        when(
                transcriptionClient.submit(
                        nextId,
                        "https://immutable.example/audio"
                )
        ).thenReturn(succeeded(nextId));
        CountDownLatch committing = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        doAnswer(call -> {
            committing.countDown();
            release.await(
                    2,
                    TimeUnit.SECONDS
            );
            return null;
        }).when(recordingTranscriptionStateService)
                .complete(
                        first,
                        transcript()
                );
        service = service(true);
        service.dispatch();
        assertThat(
                committing.await(
                        2,
                        TimeUnit.SECONDS
                )
        ).isTrue();
        try (ExecutorService requests = Executors.newSingleThreadExecutor()) {
            // when
            Future<?> dispatch = requests.submit(service::dispatch);

            // then
            release.countDown();
            dispatch.get(
                    2,
                    TimeUnit.SECONDS
            );
            verify(
                    recordingTranscriptionStateService,
                    timeout(2000)
            ).complete(
                    next,
                    transcript()
            );
            verify(transcriptionClient).submit(
                    ATTEMPT,
                    "https://immutable.example/audio"
            );
            verify(transcriptionClient).submit(
                    nextId,
                    "https://immutable.example/audio"
            );
        }
    }

    @Test
    @DisplayName("비활성 기능은 재시도를 예약하기 전에 거절한다")
    void disabledRetryDoesNotReserveAttempt() {
        // given
        service = service(false);

        // when
        Throwable failure = catchThrowable(
                () -> service.retry(
                        1,
                        3,
                        2
                )
        );

        // then
        assertThat(failure).hasMessage(RecordingErrorCode.TRANSCRIPTION_DISABLED.getMessage());
        verifyNoInteractions(
                recordingTranscriptionStateService,
                transcriptionClient,
                recordingAudioStorage
        );
    }

    @Test
    @DisplayName("종료 후에는 재시도를 예약하지 않는다")
    void closedRetryDoesNotReserveAttempt() {
        // given
        service = service(true);
        service.close();

        // when
        Throwable failure = catchThrowable(
                () -> service.retry(
                        1,
                        3,
                        2
                )
        );

        // then
        assertThat(failure).hasMessage(RecordingErrorCode.AI_NOT_READY.getMessage());
        verifyNoInteractions(
                recordingTranscriptionStateService,
                transcriptionClient,
                recordingAudioStorage
        );
    }

    private RecordingTranscriptionExecution prepare() {
        RecordingTranscriptionExecution execution = execution(
                ATTEMPT,
                NOW
        );
        when(recordingTranscriptionStateService.findProcessing()).thenReturn(
                Optional.of(execution),
                Optional.empty()
        );
        when(
                recordingAudioStorage.presignDownload(
                        "recording.webm",
                        "version-1",
                        "audio/webm",
                        100
                )
        ).thenReturn("https://immutable.example/audio");
        return execution;
    }

    private RecordingTranscriptionExecution execution(
            UUID id,
            Instant startedAt
    ) {
        return new RecordingTranscriptionExecution(
                1,
                2,
                id,
                "recording.webm",
                "version-1",
                "audio/webm",
                100,
                startedAt
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
                                "발언"
                        )
                )
        );
    }

    private AiTranscriptionJob succeeded(UUID id) {
        return new AiTranscriptionJob(
                id,
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
                recordingTranscriptionStateService,
                properties(
                        enabled,
                        Duration.ofMillis(1)
                ),
                transcriptionClient,
                recordingAudioStorage,
                clock()
        );
    }

    private TranscriptionProperties properties(
            boolean enabled,
            Duration poll
    ) {
        return new TranscriptionProperties(
                enabled,
                URI.create("http://localhost:18765"),
                "test-token",
                Duration.ofSeconds(1),
                Duration.ofSeconds(1),
                poll,
                Duration.ofSeconds(60)
        );
    }

    private Clock clock() {
        return Clock.fixed(
                NOW,
                ZoneOffset.UTC
        );
    }
}
