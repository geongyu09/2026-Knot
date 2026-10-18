package com.knot.backend.recording.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.knot.backend.global.config.TranscriptionProperties;
import com.knot.backend.recording.application.RecordingInputPreparationClient.Result;
import com.knot.backend.recording.application.RecordingInputPreparationClient.Snapshot;
import com.knot.backend.recording.application.RecordingInputPreparationState.Claim;
import com.knot.backend.recording.domain.RecordingErrorCode;
import com.knot.backend.recording.domain.RecordingException;
import com.knot.backend.recording.domain.model.StoredAudioChunk;
import com.knot.backend.recording.domain.repository.RecordingTranscriptionInputRepository;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

class RecordingInputPreparationWorkerTest {
    private final RecordingInputPreparationState state = mock(RecordingInputPreparationState.class);
    private final RecordingInputPreparationClient client = mock(RecordingInputPreparationClient.class);
    private final RecordingAudioStorage downloads = mock(RecordingAudioStorage.class);
    private final RecordingAudioFinalStorage storage = mock(RecordingAudioFinalStorage.class);
    private final Claim claim = new Claim(
            1,
            UUID.randomUUID(),
            UUID.randomUUID(),
            1,
            "recordings/1/original.webm",
            "original-v1",
            "audio/webm",
            100
    );
    private final TranscriptionProperties properties = new TranscriptionProperties(
            true,
            URI.create("http://localhost"),
            "test-token",
            Duration.ofSeconds(1),
            Duration.ofSeconds(1),
            Duration.ofMillis(1),
            Duration.ofMinutes(15)
    );
    private final RecordingInputPreparationWorker worker = new RecordingInputPreparationWorker(
            state,
            mock(RecordingTranscriptionInputRepository.class),
            client,
            downloads,
            storage,
            properties,
            Clock.systemUTC()
    );

    @BeforeEach
    void setUp() {
        when(
                state.renew(
                        any(),
                        any()
                )
        ).thenReturn(true);
    }

    @AfterEach
    void close() {
        worker.close();
    }

    @Test
    void execute_recoversFinishedAttemptVerifiesWavAndPersistsExactVersion() throws Exception {
        // given
        byte[] bytes = wav();
        String checksum = checksum(bytes);
        when(client.get(claim.attemptId())).thenReturn(snapshot(checksum));
        AtomicReference<Path> temporary = download(bytes);
        when(
                storage.uploadFinal(
                        anyString(),
                        any(),
                        anyLong(),
                        anyString()
                )
        ).thenReturn(
                new StoredAudioChunk(
                        true,
                        bytes.length,
                        "audio/wav",
                        checksum,
                        "prepared-v1"
                )
        );

        // when
        worker.execute(claim);

        // then
        verify(
                client,
                never()
        ).submit(
                any(),
                any()
        );
        verify(state).ready(
                any(),
                anyString(),
                any(),
                anyLong()
        );
        assertThat(temporary.get()).doesNotExist();
        verify(
                state,
                never()
        ).fail(
                any(),
                anyString()
        );
    }

    @Test
    void execute_validatesEntireCanonicalFileBeforeUploading() throws Exception {
        // given
        byte[] bytes = wav();
        String checksum = checksum(bytes);
        bytes[47] = 1;
        when(client.get(claim.attemptId())).thenReturn(snapshot(checksum));
        AtomicReference<Path> temporary = download(bytes);

        // when
        worker.execute(claim);

        // then
        verify(state).fail(
                claim,
                "INPUT_PREPARATION_INVALID"
        );
        verify(
                storage,
                never()
        ).uploadFinal(
                anyString(),
                any(),
                anyLong(),
                anyString()
        );
        assertThat(temporary.get()).doesNotExist();
    }

    @Test
    void execute_missingAttemptUsesOriginalExactVersionAndGetsBeforeSubmitting() throws Exception {
        // given
        byte[] bytes = wav();
        String checksum = checksum(bytes);
        when(client.get(claim.attemptId())).thenThrow(new RecordingException(RecordingErrorCode.AI_JOB_NOT_FOUND));
        when(
                downloads.presignDownload(
                        claim.sourceStorageKey(),
                        "original-v1",
                        "audio/webm",
                        100
                )
        ).thenReturn("http://source");
        when(
                client.submit(
                        claim.attemptId(),
                        "http://source"
                )
        ).thenReturn(snapshot(checksum));
        download(bytes);
        when(
                storage.uploadFinal(
                        anyString(),
                        any(),
                        anyLong(),
                        anyString()
                )
        ).thenReturn(
                new StoredAudioChunk(
                        true,
                        bytes.length,
                        "audio/wav",
                        checksum,
                        "prepared-v1"
                )
        );

        // when
        worker.execute(claim);

        // then
        InOrder order = inOrder(client);
        order.verify(client)
                .get(claim.attemptId());
        order.verify(client)
                .submit(
                        claim.attemptId(),
                        "http://source"
                );
        verify(state).ready(
                any(),
                anyString(),
                any(),
                anyLong()
        );
    }

    private Snapshot snapshot(String checksum) {
        return new Snapshot(
                claim.attemptId(),
                "SUCCEEDED",
                null,
                new Result(
                        1,
                        "pcm16le-16k-mono-v1",
                        2,
                        48,
                        checksum
                )
        );
    }

    private AtomicReference<Path> download(byte[] bytes) throws Exception {
        AtomicReference<Path> file = new AtomicReference<>();
        doAnswer(invocation -> {
            Path path = invocation.getArgument(1);
            file.set(path);
            assertThat(Files.getPosixFilePermissions(path))
                    .isEqualTo(java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));
            Files.write(
                    path,
                    bytes
            );
            return null;
        }).when(client)
                .download(
                        any(),
                        any(),
                        anyLong()
                );
        return file;
    }

    private String checksum(byte[] bytes) throws Exception {
        return Base64.getEncoder()
                .encodeToString(
                        MessageDigest.getInstance("SHA-256")
                                .digest(bytes)
                );
    }

    private byte[] wav() {
        return ByteBuffer.allocate(48)
                .order(ByteOrder.LITTLE_ENDIAN)
                .putInt(0x46464952)
                .putInt(40)
                .putInt(0x45564157)
                .putInt(0x20746d66)
                .putInt(16)
                .putShort((short) 1)
                .putShort((short) 1)
                .putInt(16000)
                .putInt(32000)
                .putShort((short) 2)
                .putShort((short) 16)
                .putInt(0x61746164)
                .putInt(4)
                .putInt(0)
                .array();
    }
}
