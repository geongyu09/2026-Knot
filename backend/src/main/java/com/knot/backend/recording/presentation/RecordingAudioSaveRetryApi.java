package com.knot.backend.recording.presentation;

import com.knot.backend.auth.domain.model.AuthenticatedMember;
import com.knot.backend.recording.presentation.dto.response.RecordingAudioSaveResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;

@Tag(name = "Recording")
public interface RecordingAudioSaveRetryApi {
    @Operation(summary = "오디오 저장 작업 재시도", description = "실패한 저장 작업을 같은 job과 manifest로 재접수합니다")
    ResponseEntity<RecordingAudioSaveResponse> retry(
            long workspaceId,
            long recordingId,
            AuthenticatedMember member
    );
}
