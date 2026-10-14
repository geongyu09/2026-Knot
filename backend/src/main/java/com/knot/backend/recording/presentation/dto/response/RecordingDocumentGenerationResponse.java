package com.knot.backend.recording.presentation.dto.response;

import com.knot.backend.document.application.dto.result.DocumentGenerationSummaryResult;
import com.knot.backend.document.domain.DocumentGenerationProcessingStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

public record RecordingDocumentGenerationResponse(
        @Schema(description = "분류·문서 생성의 종합 상태") DocumentGenerationProcessingStatus status,
        @Schema(description = "생성에 성공한 문서 수") int succeededCount,
        @Schema(description = "보존 기한 내 실패 작업 ID. 분류 실패와 재시도 한도 소진 작업을 포함하며 없으면 빈 배열") List<Long> failedJobIds
) {

    public static RecordingDocumentGenerationResponse from(DocumentGenerationSummaryResult result) {
        return new RecordingDocumentGenerationResponse(
                result.status(),
                result.succeededCount(),
                result.failedJobIds()
        );
    }
}
