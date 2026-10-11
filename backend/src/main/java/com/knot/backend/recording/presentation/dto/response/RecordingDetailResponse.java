package com.knot.backend.recording.presentation.dto.response;

import com.knot.backend.recording.application.dto.result.RecordingDetailResult;
import com.knot.backend.recording.domain.RecordingAudioUploadStatus;
import com.knot.backend.recording.domain.RecordingEndReason;
import com.knot.backend.recording.domain.RecordingStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;

public record RecordingDetailResponse(
        @Schema(description = "녹음 세션 상태") RecordingStatus status,
        @Schema(description = "일시정지를 뺀 서버 기준 녹음 시간") long elapsedMillis,
        @Schema(description = "종료 시각. 진행 중이면 null", nullable = true) Instant endedAt,
        @Schema(description = "종료 사유. 진행 중이거나 기록 전 종료면 null", nullable = true) RecordingEndReason endReason,
        @Schema(description = "최종 오디오 업로드 상태. 예약 전 null", nullable = true) RecordingAudioUploadStatus audioUploadStatus
) {

    public static RecordingDetailResponse from(RecordingDetailResult result) {
        return new RecordingDetailResponse(
                result.status(),
                result.elapsedMillis(),
                result.endedAt(),
                result.endReason(),
                result.audioUploadStatus()
        );
    }
}
