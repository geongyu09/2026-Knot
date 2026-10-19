package com.knot.ai.preparation.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.atLeastOnce;
import com.knot.ai.preparation.domain.AudioPreparationResult;
import com.knot.ai.transcription.domain.TranscriptionException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import java.time.Clock;
import java.time.Instant;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class AudioPreparationServiceTest {
    @TempDir
    Path directory;

    @Test
    void retainsCompletedArtifactUntilReplacementAndPinsReaders() throws Exception {
        // given
        AudioPreparationEngine engine = mock(AudioPreparationEngine.class);
        when(engine.isReady()).thenReturn(true);
        UUID first = UUID.randomUUID();
        Path audio = directory.resolve("prepared.wav");
        Files.write(
                audio,
                new byte[46]
        );
        when(engine.audio(first)).thenReturn(audio);
        when(
                engine.prepare(
                        any(),
                        any()
                )
        ).thenReturn(result());
        try (ServiceCloser closer = new ServiceCloser(new AudioPreparationService(engine))) {
            AudioPreparationService service = closer.service;
            service.create(
                    first,
                    "https://first"
            );
            await(
                    service,
                    first
            );
            // when
            AudioPreparationService.AudioDownload download = service.audio(first);
            // then
            assertThat(
                    service.create(
                            first,
                            "https://refreshed"
                    )
                            .status()
            ).isEqualTo(AudioPreparationSnapshot.Status.SUCCEEDED);
            assertThatThrownBy(
                    () -> service.create(
                            UUID.randomUUID(),
                            "https://next"
                    )
            ).isInstanceOf(TranscriptionException.class);
            verify(
                    engine,
                    never()
            ).cleanup(first);
            download.resource()
                    .getInputStream()
                    .close();
            service.create(
                    UUID.randomUUID(),
                    "https://next"
            );
            verify(engine).cleanup(first);
            verify(
                    engine,
                    times(1)
            ).prepare(
                    first,
                    "https://first"
            );
        }
    }

    @Test
    void partialFailureIsCleanedAndSafeFailureCodeIsRetained() throws Exception {
        // given
        AudioPreparationEngine engine = mock(AudioPreparationEngine.class);
        when(engine.isReady()).thenReturn(true);
        when(
                engine.prepare(
                        any(),
                        any()
                )
        ).thenThrow(new IllegalStateException("private input"));
        UUID id = UUID.randomUUID();
        try (ServiceCloser closer = new ServiceCloser(new AudioPreparationService(engine))) {
            closer.service.create(
                    id,
                    "https://input"
            );
            // when
            AudioPreparationSnapshot failed = await(
                    closer.service,
                    id
            );
            // then
            assertThat(failed.failureCode()).isEqualTo("DECODE_FAILED");
            assertThat(failed.result()).isNull();
            verify(engine).cleanup(id);
            assertThatThrownBy(() -> closer.service.audio(id)).isInstanceOf(TranscriptionException.class);
        }
    }

    @Test
    void anotherPreparationIsBusyAndShutdownCancelsWorker() throws Exception {
        // given
        AudioPreparationEngine engine = mock(AudioPreparationEngine.class);
        when(engine.isReady()).thenReturn(true);
        CountDownLatch entered = new CountDownLatch(1);
        when(
                engine.prepare(
                        any(),
                        any()
                )
        ).thenAnswer(invocation -> {
            entered.countDown();
            new CountDownLatch(1).await();
            return result();
        });
        AudioPreparationService service = new AudioPreparationService(engine);
        UUID id = UUID.randomUUID();
        service.create(
                id,
                "https://input"
        );
        assertThat(
                entered.await(
                        2,
                        TimeUnit.SECONDS
                )
        ).isTrue();
        // when
        Throwable busy = org.assertj.core.api.Assertions.catchThrowable(
                () -> service.create(
                        UUID.randomUUID(),
                        "https://next"
                )
        );
        // then
        assertThat(busy).isInstanceOf(TranscriptionException.class);
        service.close();
        assertThat(
                service.get(id)
                        .status()
        ).isEqualTo(AudioPreparationSnapshot.Status.FAILED);
        verify(
                engine,
                atLeastOnce()
        ).cleanup(id);
    }

    @Test
    void terminalCacheExpiresWithoutAnotherPreparationRequest() throws Exception {
        // given
        AudioPreparationEngine engine = mock(AudioPreparationEngine.class);
        when(engine.isReady()).thenReturn(true);
        when(
                engine.prepare(
                        any(),
                        any()
                )
        ).thenReturn(result());
        Clock clock = mock(Clock.class);
        Instant started = Instant.parse("2026-10-18T00:00:00Z");
        when(clock.instant()).thenReturn(started);
        UUID id = UUID.randomUUID();
        try (ServiceCloser closer = new ServiceCloser(
                new AudioPreparationService(
                        engine,
                        clock
                )
        )) {
            AudioPreparationService service = closer.service;
            service.create(
                    id,
                    "https://source"
            );
            await(
                    service,
                    id
            );
            when(clock.instant()).thenReturn(started.plusSeconds(899));
            assertThat(
                    service.get(id)
                            .status()
            ).isEqualTo(AudioPreparationSnapshot.Status.SUCCEEDED);
            when(clock.instant()).thenReturn(started.plus(Duration.ofMinutes(15)));

            // when
            service.cleanupExpired();

            // then
            verify(engine).cleanup(id);
            assertThatThrownBy(() -> service.get(id)).isInstanceOf(TranscriptionException.class);
            assertThatThrownBy(() -> service.audio(id)).isInstanceOf(TranscriptionException.class);
        }
    }

    @Test
    void expiryHidesSnapshotAndNewAudioButPinsExistingReaderUntilClose() throws Exception {
        // given
        AudioPreparationEngine engine = mock(AudioPreparationEngine.class);
        when(engine.isReady()).thenReturn(true);
        when(
                engine.prepare(
                        any(),
                        any()
                )
        ).thenReturn(result());
        Clock clock = mock(Clock.class);
        Instant started = Instant.parse("2026-10-18T00:00:00Z");
        when(clock.instant()).thenReturn(started);
        UUID id = UUID.randomUUID();
        Path audio = directory.resolve("cache.wav");
        Files.write(
                audio,
                new byte[46]
        );
        when(engine.audio(id)).thenReturn(audio);
        org.mockito.Mockito.doAnswer(invocation -> {
            Files.deleteIfExists(audio);
            return null;
        })
                .when(engine)
                .cleanup(id);
        try (ServiceCloser closer = new ServiceCloser(
                new AudioPreparationService(
                        engine,
                        clock
                )
        )) {
            AudioPreparationService service = closer.service;
            service.create(
                    id,
                    "https://source"
            );
            await(
                    service,
                    id
            );
            AudioPreparationService.AudioDownload download = service.audio(id);
            java.io.InputStream input = download.resource()
                    .getInputStream();
            when(clock.instant()).thenReturn(started.plus(Duration.ofMinutes(15)));

            // when
            service.cleanupExpired();

            // then
            verify(
                    engine,
                    never()
            ).cleanup(id);
            assertThatThrownBy(() -> service.get(id)).isInstanceOf(TranscriptionException.class);
            assertThatThrownBy(() -> service.audio(id)).isInstanceOf(TranscriptionException.class);
            assertThat(input.readAllBytes()).hasSize(46);
            assertThat(audio).exists();
            input.close();
            verify(engine).cleanup(id);
            assertThat(audio).doesNotExist();
        }
    }

    @Test
    void expiredFailedAttemptCanRegenerateWithRefreshedDownloadUrl() throws Exception {
        // given
        AudioPreparationEngine engine = mock(AudioPreparationEngine.class);
        when(engine.isReady()).thenReturn(true);
        when(
                engine.prepare(
                        any(),
                        any()
                )
        ).thenThrow(new IllegalStateException("decode"))
                .thenReturn(result());
        Clock clock = mock(Clock.class);
        Instant started = Instant.parse("2026-10-18T00:00:00Z");
        when(clock.instant()).thenReturn(started);
        UUID id = UUID.randomUUID();
        try (ServiceCloser closer = new ServiceCloser(
                new AudioPreparationService(
                        engine,
                        clock
                )
        )) {
            AudioPreparationService service = closer.service;
            service.create(
                    id,
                    "https://expired-source"
            );
            assertThat(
                    await(
                            service,
                            id
                    ).status()
            ).isEqualTo(AudioPreparationSnapshot.Status.FAILED);
            when(clock.instant()).thenReturn(started.plus(Duration.ofMinutes(15)));

            // when
            service.create(
                    id,
                    "https://refreshed-source"
            );

            // then
            assertThat(
                    await(
                            service,
                            id
                    ).status()
            ).isEqualTo(AudioPreparationSnapshot.Status.SUCCEEDED);
            verify(engine).prepare(
                    id,
                    "https://refreshed-source"
            );
        }
    }

    @Test
    void cleanupFailureDisablesAdmissionAndExpiredReadsRemainNotFound() throws Exception {
        // given
        AudioPreparationEngine engine = mock(AudioPreparationEngine.class);
        when(engine.isReady()).thenReturn(true);
        when(
                engine.prepare(
                        any(),
                        any()
                )
        ).thenReturn(result());
        UUID id = UUID.randomUUID();
        org.mockito.Mockito.doThrow(new java.io.IOException("cleanup"))
                .when(engine)
                .cleanup(id);
        Clock clock = mock(Clock.class);
        Instant started = Instant.parse("2026-10-18T00:00:00Z");
        when(clock.instant()).thenReturn(started);
        AudioPreparationService service = new AudioPreparationService(
                engine,
                clock
        );
        service.create(
                id,
                "https://source"
        );
        await(
                service,
                id
        );
        when(clock.instant()).thenReturn(started.plus(Duration.ofMinutes(15)));
        try {
            // when
            Throwable failure = org.assertj.core.api.Assertions.catchThrowable(service::cleanupExpired);

            // then
            assertThat(failure).isInstanceOf(TranscriptionException.class);
            assertThatThrownBy(
                    () -> service.create(
                            UUID.randomUUID(),
                            "https://new-source"
                    )
            ).isInstanceOf(TranscriptionException.class);
            assertThatThrownBy(() -> service.get(id)).isInstanceOf(TranscriptionException.class)
                    .extracting(error -> ((TranscriptionException) error).getCode())
                    .isEqualTo("JOB_NOT_FOUND");
        } finally {
            assertThatThrownBy(service::close).isInstanceOf(TranscriptionException.class);
        }
    }

    private AudioPreparationResult result() {
        return new AudioPreparationResult(
                1,
                "pcm16le-16k-mono-v1",
                1,
                46,
                "A".repeat(43) + "="
        );
    }

    private AudioPreparationSnapshot await(
            AudioPreparationService service,
            UUID id
    ) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        while (System.nanoTime() < deadline) {
            AudioPreparationSnapshot state = service.get(id);
            if (state.status() != AudioPreparationSnapshot.Status.PROCESSING) {
                return state;
            }
            Thread.sleep(5);
        }
        throw new AssertionError("preparation did not complete");
    }

    private record ServiceCloser(AudioPreparationService service) implements AutoCloseable {
        @Override
        public void close() {
            service.close();
        }
    }
}
