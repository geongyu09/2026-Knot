package com.knot.ai.transcription.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import com.knot.ai.TestFixtures;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;

class AudioPreparationCanonicalTest {
    @TempDir
    Path directory;

    @Test
    void headerIsCanonical44BytePcm16Mono16k() {
        // given
        long pcmBytes = 32000;
        // when
        byte[] header = FfmpegAudioPreparationEngine.header(pcmBytes);
        // then
        ByteBuffer bytes = ByteBuffer.wrap(header)
                .order(ByteOrder.LITTLE_ENDIAN);
        assertThat(header).hasSize(44);
        assertThat(bytes.getInt(4)).isEqualTo(32036);
        assertThat(bytes.getInt(16)).isEqualTo(16);
        assertThat(bytes.getShort(20)).isEqualTo((short) 1);
        assertThat(bytes.getShort(22)).isEqualTo((short) 1);
        assertThat(bytes.getInt(24)).isEqualTo(16000);
        assertThat(bytes.getInt(28)).isEqualTo(32000);
        assertThat(bytes.getShort(34)).isEqualTo((short) 16);
        assertThat(bytes.getInt(40)).isEqualTo(32000);
    }

    @Test
    void restartRejectsSymlinkInsteadOfFollowingExternalFiles() throws Exception {
        // given
        Path work = directory.resolve("blocked-inference");
        Path root = directory.resolve("blocked-inference-preparations");
        Path external = directory.resolve("external");
        Files.createDirectories(root);
        Files.createDirectories(external);
        Path preserved = external.resolve("keep");
        Files.writeString(
                preserved,
                "private"
        );
        Files.createSymbolicLink(
                root.resolve(
                        UUID.randomUUID()
                                .toString()
                ),
                external
        );
        // when
        Throwable rejected = org.assertj.core.api.Assertions.catchThrowable(
                () -> new FfmpegAudioPreparationEngine(
                        TestFixtures.properties(work),
                        mock(S3AudioDownloader.class),
                        JsonMapper.builder()
                                .build()
                )
        );
        // then
        assertThat(rejected).isInstanceOf(com.knot.ai.transcription.domain.TranscriptionException.class);
        assertThat(preserved).exists();
    }

    @Test
    void restartRemovesOnlyOwnedPreparationPartialDirectories() throws Exception {
        // given
        Path work = directory.resolve("inference");
        Path root = directory.resolve("inference-preparations");
        Path partial = root.resolve(
                UUID.randomUUID()
                        .toString()
        );
        Files.createDirectories(partial);
        Files.writeString(
                partial.resolve("preparation.pcm"),
                "partial"
        );
        Files.createDirectories(work);
        Path unrelated = work.resolve("keep");
        Files.writeString(
                unrelated,
                "inference"
        );
        // when
        new FfmpegAudioPreparationEngine(
                TestFixtures.properties(work),
                mock(S3AudioDownloader.class),
                JsonMapper.builder()
                        .build()
        );
        // then
        assertThat(partial).doesNotExist();
        assertThat(unrelated).exists();
    }
}
