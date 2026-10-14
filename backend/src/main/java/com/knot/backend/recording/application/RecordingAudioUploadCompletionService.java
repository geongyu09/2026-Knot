package com.knot.backend.recording.application;

import com.knot.backend.recording.application.dto.result.PendingAudioUpload;
import com.knot.backend.recording.application.dto.result.RecordingAudioUploadCompletionResult;
import com.knot.backend.recording.application.dto.result.StoredAudioObject;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class RecordingAudioUploadCompletionService {
    private final RecordingAudioUploadCompletionTransaction completionTransaction;
    private final RecordingAudioStorage audioStorage;
    private final RecordingTranscriptionService transcriptionService;

    public RecordingAudioUploadCompletionResult complete(
            long workspaceId,
            long memberId,
            long recordingId,
            long uploadId
    ) {
        PendingAudioUpload pending = completionTransaction.prepare(
                workspaceId,
                memberId,
                recordingId,
                uploadId
        );
        StoredAudioObject storedObject = pending.completed()
                ? StoredAudioObject.missing()
                : audioStorage.findStoredObject(pending.storageKey());
        RecordingAudioUploadCompletionResult result = completionTransaction.complete(
                workspaceId,
                memberId,
                recordingId,
                uploadId,
                storedObject
        );
        transcriptionService.dispatch();
        return result;
    }
}
