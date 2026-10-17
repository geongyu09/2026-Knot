package com.knot.ai.transcription.presentation.dto.request;

import com.knot.ai.transcription.application.command.CreateTranscriptionCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.util.UUID;

public record CreateTranscriptionRequest(
        @NotNull(message = "요청 ID는 필수입니다") UUID attemptId,
        @NotBlank(message = "다운로드 URL은 필수입니다") String downloadUrl,
        @Positive(message = "화자 수는 양수여야 합니다") Integer speakerCount
) {
    public CreateTranscriptionCommand toCommand() {
        return new CreateTranscriptionCommand(
                attemptId,
                downloadUrl,
                speakerCount
        );
    }
}
