package com.knot.backend.recording.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.knot.backend.recording.application.dto.result.PreparedWindowSource;
import com.knot.backend.recording.application.dto.result.TranscriptionWindowAudioSource;
import com.knot.backend.recording.domain.RecordingException;
import com.knot.backend.recording.domain.model.RecordingTranscriptionWindow;
import com.knot.backend.recording.domain.model.StoredAudioChunk;
import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.ObjectMapper;

class PreparedWindowAudioAssemblerTest {
    private static final String CHECKSUM = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    private static final String KEY = "recordings/1/prepared/00000000-0000-0000-0000-000000000001/" + "0".repeat(64)
            + ".wav";
    @TempDir
    Path directory;
    private final RecordingAudioFinalStorage storage = mock(RecordingAudioFinalStorage.class);
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    @DisplayName("준비 WAV의 고정 버전에서 필요한 PCM 범위만 읽어 독립 WAV를 만든다")
    void materialize_success_exactPreparedRange() throws Exception {
        // given
        TranscriptionWindowAudioAssembler assembler = new TranscriptionWindowAudioAssembler(
                storage,
                mapper,
                directory
        );
        TranscriptionWindowAudioSource source = source();
        byte[] pcm = new byte[32_000];
        pcm[0] = 17;
        pcm[31_999] = 29;
        when(
                storage.openFinalRange(
                        KEY,
                        "prepared-v1",
                        32_044,
                        32_000
                )
        ).thenReturn(new ByteArrayInputStream(pcm));
        AtomicReference<byte[]> uploaded = new AtomicReference<>();
        when(
                storage.uploadFinal(
                        anyString(),
                        any(Path.class),
                        anyLong(),
                        anyString()
                )
        ).thenAnswer(invocation -> {
            uploaded.set(
                    Files.readAllBytes(
                            invocation.getArgument(
                                    1,
                                    Path.class
                            )
                    )
            );
            return new StoredAudioChunk(
                    true,
                    invocation.getArgument(
                            2,
                            Long.class
                    ),
                    "audio/wav",
                    invocation.getArgument(
                            3,
                            String.class
                    ),
                    "window-v1"
            );
        });

        // when
        TranscriptionWindowAudioAssembler.MaterializedWindowAudio materialized = assembler.materialize(source);

        // then
        verify(storage).openFinalRange(
                KEY,
                "prepared-v1",
                32_044,
                32_000
        );
        assertThat(uploaded.get()).hasSize(32_044);
        assertThat(uploaded.get()[44]).isEqualTo((byte) 17);
        assertThat(uploaded.get()[32_043]).isEqualTo((byte) 29);
        assertThat(
                materialized.metadata()
                        .versionId()
        ).isEqualTo("window-v1");
        try (Stream<Path> files = Files.list(directory)) {
            assertThat(files).isEmpty();
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"key", "version", "checksum", "length"})
    @DisplayName("manifest와 source의 준비 WAV 정체성이 다르면 S3 읽기 전에 거절한다")
    void materialize_failure_preparedSourceMismatch(String condition) {
        // given
        TranscriptionWindowAudioAssembler assembler = new TranscriptionWindowAudioAssembler(
                storage,
                mapper,
                directory
        );
        TranscriptionWindowAudioSource original = source();
        TranscriptionWindowAudioSource changed = new TranscriptionWindowAudioSource(
                original.windowId(),
                original.recordingId(),
                original.pipelineVersion(),
                original.manifestJson(),
                original.manifestSha256(),
                condition.equals("key")
                        ? KEY.replace(
                                "000000000001",
                                "000000000002"
                        )
                        : KEY,
                condition.equals("version") ? "changed-v2" : "prepared-v1",
                condition.equals("checksum") ? "/".repeat(43) + "=" : CHECKSUM,
                condition.equals("length") ? 64_042 : 64_044
        );

        // when
        Throwable failure = catchThrowable(() -> assembler.materialize(changed));

        // then
        assertThat(failure).isInstanceOf(RecordingException.class);
        verifyNoInteractions(storage);
    }

    private TranscriptionWindowAudioSource source() {
        PreparedWindowSource source = new PreparedWindowSource(
                KEY,
                "prepared-v1",
                CHECKSUM,
                64_044,
                32_000
        );
        RecordingTranscriptionWindow window = new RecordingTranscriptionWindowPlanner(mapper).planPrepared(
                1,
                "prepared-window-v1-30-5",
                16_000,
                0,
                source,
                Instant.parse("2026-10-18T00:00:00Z")
        )
                .getLast();
        return new TranscriptionWindowAudioSource(
                1,
                1,
                window.getPipelineVersion(),
                window.getManifestJson(),
                window.getManifestSha256(),
                KEY,
                "prepared-v1",
                CHECKSUM,
                64_044
        );
    }
}
