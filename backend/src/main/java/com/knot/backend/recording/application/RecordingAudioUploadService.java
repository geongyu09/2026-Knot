package com.knot.backend.recording.application;

import com.knot.backend.global.config.TranscriptionProperties;
import com.knot.backend.recording.application.dto.command.RecordingAudioUploadUrlCommand;
import com.knot.backend.recording.application.dto.result.PresignedAudioUpload;
import com.knot.backend.recording.application.dto.result.RecordingAudioUploadCompletionResult;
import com.knot.backend.recording.application.dto.result.RecordingAudioUploadUrlResult;
import com.knot.backend.recording.domain.model.RecordingAudioUpload;
import com.knot.backend.recording.domain.model.RecordingSession;
import com.knot.backend.recording.domain.repository.RecordingAudioUploadRepository;
import com.knot.backend.recording.domain.RecordingErrorCode;
import com.knot.backend.recording.domain.RecordingException;
import com.knot.backend.recording.domain.model.StoredAudioObject;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class RecordingAudioUploadService {
    private static final String STORAGE_KEY_PREFIX = "recordings/";

    private final RecordingAccess recordingAccess;
    private final RecordingAudioUploadRepository recordingAudioUploadRepository;
    private final RecordingAudioStorage recordingAudioStorage;
    private final Clock clock;
    private final RecordingTranscriptionStateService recordingTranscriptionStateService;
    private final TranscriptionProperties transcriptionProperties;

    @Transactional
    public RecordingAudioUploadUrlResult issue(
            long workspaceId,
            long memberId,
            long recordingId,
            RecordingAudioUploadUrlCommand command
    ) {
        RecordingLog.Scope trace = RecordingLog.begin(
                "recording.upload_url",
                workspaceId,
                recordingId,
                null,
                null
        );
        return trace.call(() -> {
            RecordingSession session = recordingAccess.loadOwnedForUpdate(
                    workspaceId,
                    memberId,
                    recordingId
            );
            session.validateLegacyAudioMode();
            session.validateEnded();

            Optional<RecordingAudioUpload> existing = recordingAudioUploadRepository.findByRecordingId(recordingId);
            existing.ifPresent(
                    reserved -> reserved.validateReissuable(
                            command.contentType(),
                            command.contentLength()
                    )
            );
            RecordingAudioUpload upload = existing.orElseGet(
                    () -> recordingAudioUploadRepository.save(
                            reserve(
                                    recordingId,
                                    command
                            )
                    )
            );
            trace.upload(upload.getId())
                    .outcome(uploadUrlOutcome(existing.isEmpty()));
            PresignedAudioUpload presigned = recordingAudioStorage.presignUpload(
                    upload.getStorageKey(),
                    upload.getContentType(),
                    upload.getContentLength()
            );
            return new RecordingAudioUploadUrlResult(
                    upload.getId(),
                    presigned.uploadUrl(),
                    presigned.expiresAt(),
                    existing.isEmpty()
            );
        });
    }

    @Transactional
    public Optional<String> findStorageKeyToConfirm(
            long workspaceId,
            long memberId,
            long recordingId,
            long uploadId
    ) {
        return findValidatedUpload(
                workspaceId,
                memberId,
                recordingId,
                uploadId
        ).findStorageKeyToConfirm();
    }

    @Transactional
    public RecordingAudioUploadCompletionResult complete(
            long workspaceId,
            long memberId,
            long recordingId,
            long uploadId,
            StoredAudioObject storedObject
    ) {
        RecordingLog.Scope trace = RecordingLog.begin(
                "recording.upload.complete",
                workspaceId,
                recordingId,
                uploadId,
                null
        );
        return trace.call(() -> {
            RecordingAudioUpload upload = findValidatedUpload(
                    workspaceId,
                    memberId,
                    recordingId,
                    uploadId
            );
            trace.outcome(uploadCompletionOutcome(upload));
            upload.complete(
                    storedObject,
                    clock.instant()
                            .truncatedTo(ChronoUnit.MICROS)
            );
            recordingAudioUploadRepository.save(upload);
            if (transcriptionProperties.enabled() && upload.isAudioAvailable()) {
                recordingTranscriptionStateService.registerAutomatic(recordingId);
            }
            return RecordingAudioUploadCompletionResult.from(upload);
        });
    }

    private String uploadUrlOutcome(boolean created) {
        if (created) {
            return "issued";
        }
        return "reissued";
    }

    private String uploadCompletionOutcome(RecordingAudioUpload upload) {
        if (upload.isCompleted()) {
            return "replayed";
        }
        return "completed";
    }

    private RecordingAudioUpload findValidatedUpload(
            long workspaceId,
            long memberId,
            long recordingId,
            long uploadId
    ) {
        if (uploadId <= 0) {
            throw new RecordingException(RecordingErrorCode.INVALID_RECORDING_DATA);
        }
        RecordingSession session = recordingAccess.loadOwnedForUpdate(
                workspaceId,
                memberId,
                recordingId
        );
        session.validateLegacyAudioMode();
        session.validateEnded();
        RecordingAudioUpload upload = recordingAudioUploadRepository.findById(uploadId)
                .orElseThrow(() -> new RecordingException(RecordingErrorCode.AUDIO_UPLOAD_NOT_FOUND));
        upload.validateBelongsTo(recordingId);
        return upload;
    }

    private RecordingAudioUpload reserve(
            long recordingId,
            RecordingAudioUploadUrlCommand command
    ) {
        return RecordingAudioUpload.reserve(
                recordingId,
                STORAGE_KEY_PREFIX + recordingId + "/" + UUID.randomUUID(),
                command.contentType(),
                command.contentLength(),
                clock.instant()
                        .truncatedTo(ChronoUnit.MICROS)
        );
    }
}
