package com.knot.backend.recording.application;

import com.knot.backend.recording.application.dto.result.RecordingAudioUploadCompletionResult;
import com.knot.backend.recording.domain.model.StoredAudioObject;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class RecordingAudioUploadCompletionService {
    private final RecordingAudioUploadService recordingAudioUploadService;
    private final RecordingAudioStorage recordingAudioStorage;
    private final RecordingTranscriptionService recordingTranscriptionService;

    public RecordingAudioUploadCompletionResult complete(
            long workspaceId,
            long memberId,
            long recordingId,
            long uploadId
    ) {
        RecordingLog.Scope prepare = RecordingLog.begin(
                "recording.upload.prepare",
                workspaceId,
                recordingId,
                uploadId,
                null
        );
        Optional<String> storageKey = prepare.call(() -> {
            Optional<String> found = recordingAudioUploadService.findStorageKeyToConfirm(
                    workspaceId,
                    memberId,
                    recordingId,
                    uploadId
            );
            prepare.outcome(found.isPresent() ? "prepared" : "replayed");
            return found;
        });
        StoredAudioObject storedObject = storageKey.map(key -> {
            RecordingLog.Scope verification = RecordingLog.begin(
                    "recording.upload.verify",
                    workspaceId,
                    recordingId,
                    uploadId,
                    null
            );
            return verification.call(() -> {
                StoredAudioObject found = recordingAudioStorage.findStoredObject(key);
                verification.outcome(found.exists() ? "found" : "missing");
                return found;
            });
        })
                .orElseGet(StoredAudioObject::missing);
        RecordingAudioUploadCompletionResult result = recordingAudioUploadService.complete(
                workspaceId,
                memberId,
                recordingId,
                uploadId,
                storedObject
        );
        recordingTranscriptionService.dispatch();
        return result;
    }
}
