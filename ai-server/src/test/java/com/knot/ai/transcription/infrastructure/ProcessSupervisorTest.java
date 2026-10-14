package com.knot.ai.transcription.infrastructure;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.knot.ai.global.AiServerProperties;
import com.knot.ai.transcription.domain.TranscriptionException;
import java.io.IOException;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(OutputCaptureExtension.class)
class ProcessSupervisorTest {
    @TempDir
    Path directory;

    @Test
    @DisplayName("감독 프로세스 시작 오류는 원인을 보존하고 비밀 경로는 로그에 노출하지 않는다")
    void runInference_failure_preservesCauseWithoutSecret(CapturedOutput output) {
        // given
        AiServerProperties properties = new AiServerProperties(
                "test-token",
                directory,
                directory.resolve("profile.json"),
                directory,
                Set.of("test-bucket.s3.ap-northeast-2.amazonaws.com"),
                Duration.ofSeconds(2),
                Duration.ofSeconds(2),
                Duration.ofSeconds(2),
                "/missing/SECRET_EXECUTABLE",
                "pnpm",
                "ffmpeg"
        );
        ProcessSupervisor supervisor = new ProcessSupervisor(
                properties,
                JsonMapper.builder()
                        .build(),
                () -> {
                }
        );
        // when
        TranscriptionException exception = assertThrows(
                TranscriptionException.class,
                () -> supervisor.runInference(
                        List.of("ignored"),
                        directory,
                        Duration.ofSeconds(1)
                )
        );
        // then
        assertEquals(
                "INFERENCE_FAILED",
                exception.getCode()
        );
        assertInstanceOf(
                IOException.class,
                exception.getCause()
        );
        assertTrue(
                output.getOut()
                        .contains("Supervisor process could not start")
        );
        assertFalse(
                output.getAll()
                        .contains("SECRET_EXECUTABLE")
        );
    }
}
