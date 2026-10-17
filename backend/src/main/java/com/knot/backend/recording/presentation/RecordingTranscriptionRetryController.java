package com.knot.backend.recording.presentation;

import com.knot.backend.auth.domain.AuthenticatedMember;
import com.knot.backend.recording.application.RecordingTranscriptionService;
import com.knot.backend.recording.presentation.dto.response.RecordingTranscriptionRetryResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/workspaces/{workspaceId}/recordings")
@RequiredArgsConstructor
public class RecordingTranscriptionRetryController implements RecordingTranscriptionRetryApi {
    private final RecordingTranscriptionService recordingTranscriptionService;

    @Override
    @PostMapping("/{recordingId}/transcription/retry")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public RecordingTranscriptionRetryResponse retry(
            @PathVariable long workspaceId,
            @PathVariable long recordingId,
            @AuthenticationPrincipal AuthenticatedMember authenticatedMember
    ) {
        return RecordingTranscriptionRetryResponse.from(
                recordingTranscriptionService.retry(
                        workspaceId,
                        authenticatedMember.getMemberId(),
                        recordingId
                )
        );
    }
}
