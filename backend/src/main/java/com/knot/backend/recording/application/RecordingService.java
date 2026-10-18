package com.knot.backend.recording.application;

import com.knot.backend.recording.domain.repository.RecordingAudioChunkRepository;
import com.knot.backend.recording.domain.model.RecordingAudioSealKind;
import com.knot.backend.recording.domain.model.RecordingAudioChunk;
import com.knot.backend.recording.domain.model.AudioChunkDescriptor;
import com.knot.backend.recording.application.dto.command.RecordingAudioSealCommand;
import com.knot.backend.recording.application.dto.result.RecordingAudioSealSummary;
import com.knot.backend.global.config.RecordingAudioChunksProperties;
import com.knot.backend.member.domain.MemberRepository;
import com.knot.backend.recording.domain.model.RecordingAudioMode;
import com.knot.backend.recording.domain.model.RecordingAudioStream;
import com.knot.backend.recording.domain.repository.RecordingAudioStreamRepository;
import com.knot.backend.recording.application.dto.command.RecordingControlCommand;
import com.knot.backend.recording.application.dto.command.RecordingStartCommand;
import com.knot.backend.recording.application.dto.result.RecordingCurrentResult;
import com.knot.backend.recording.application.dto.result.RecordingEndResult;
import com.knot.backend.recording.application.dto.result.RecordingHeartbeatResult;
import com.knot.backend.recording.application.dto.result.RecordingPauseResult;
import com.knot.backend.recording.application.dto.result.RecordingResumeResult;
import com.knot.backend.recording.application.dto.result.RecordingStartResult;
import com.knot.backend.recording.domain.RecordingErrorCode;
import com.knot.backend.recording.domain.RecordingException;
import com.knot.backend.recording.domain.model.RecordingSession;
import com.knot.backend.recording.domain.repository.RecordingSessionRepository;
import com.knot.backend.recording.domain.repository.RecordingAudioFinalizationRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class RecordingService {
    private final RecordingAccess recordingAccess;
    private final MemberRepository memberRepository;
    private final RecordingSessionRepository recordingSessionRepository;
    private final RecordingControlTokenHasher recordingControlTokenHasher;
    private final Clock clock;
    private final RecordingAudioSealing audioSealing;
    private final RecordingAudioStreamRepository recordingAudioStreamRepository;
    private final RecordingAudioChunksProperties audioChunksProperties;
    private final RecordingAudioChunkRepository chunks;
    private final RecordingAudioFinalizationRepository finalizations;

    @Transactional
    public RecordingStartResult start(
            long workspaceId,
            long memberId,
            RecordingStartCommand command
    ) {
        recordingAccess.lockMember(
                workspaceId,
                memberId
        );
        memberRepository.findByIdForUpdate(memberId)
                .orElseThrow(() -> new RecordingException(RecordingErrorCode.RECORDING_MEMBER_NOT_FOUND));

        String controlTokenHash = recordingControlTokenHasher.hash(command.controlToken());
        Optional<RecordingSession> existing = recordingSessionRepository.findByMemberIdAndRequestIdForUpdate(
                memberId,
                command.requestId()
        );
        if (existing.isPresent()) {
            return replay(
                    existing.orElseThrow(),
                    workspaceId,
                    command,
                    controlTokenHash
            );
        }
        if (command.audioMode() == RecordingAudioMode.PCM16_CHUNKS_V1 && !audioChunksProperties.enabled()) {
            throw new RecordingException(RecordingErrorCode.AUDIO_MODE_DISABLED);
        }
        releaseActiveRecordings(memberId);

        RecordingSession session = RecordingSession.start(
                workspaceId,
                memberId,
                command.requestId(),
                command.tabId(),
                controlTokenHash,
                now(),
                command.audioMode()
        );
        RecordingSession saved = recordingSessionRepository.save(session);
        if (saved.getAudioMode() == RecordingAudioMode.PCM16_CHUNKS_V1) {
            recordingAudioStreamRepository.save(RecordingAudioStream.create(saved.getId()));
        }
        return RecordingStartResult.from(
                saved,
                true
        );
    }

    @Transactional(readOnly = true)
    public Optional<RecordingCurrentResult> findCurrent(
            long workspaceId,
            long memberId
    ) {
        recordingAccess.validateMember(
                workspaceId,
                memberId
        );
        Optional<RecordingSession> activeSession = recordingSessionRepository.findActiveByWorkspaceIdAndMemberId(
                workspaceId,
                memberId
        );
        Instant now = clock.instant();
        return activeSession.map(
                session -> RecordingCurrentResult.of(
                        session,
                        now
                )
        );
    }

    @Transactional(noRollbackFor = RecordingException.class)
    public RecordingPauseResult pause(
            long workspaceId,
            long memberId,
            long recordingId,
            RecordingControlCommand command
    ) {
        RecordingSession session = recordingAccess.loadControlledForUpdate(
                workspaceId,
                memberId,
                recordingId,
                command
        );
        Instant now = now();
        expireAndSeal(
                session,
                now
        );
        session.pause(now);
        return RecordingPauseResult.from(recordingSessionRepository.save(session));
    }

    @Transactional(noRollbackFor = RecordingException.class)
    public RecordingResumeResult resume(
            long workspaceId,
            long memberId,
            long recordingId,
            RecordingControlCommand command
    ) {
        RecordingSession session = recordingAccess.loadControlledForUpdate(
                workspaceId,
                memberId,
                recordingId,
                command
        );
        Instant now = now();
        expireAndSeal(
                session,
                now
        );
        session.resume(now);
        return RecordingResumeResult.from(recordingSessionRepository.save(session));
    }

    @Transactional(noRollbackFor = RecordingAudioCaptureExpiredException.class)
    public RecordingEndResult end(
            long workspaceId,
            long memberId,
            long recordingId,
            RecordingControlCommand command
    ) {
        return end(
                workspaceId,
                memberId,
                recordingId,
                command,
                null
        );
    }

    @Transactional(noRollbackFor = RecordingAudioCaptureExpiredException.class)
    public RecordingEndResult end(
            long workspaceId,
            long memberId,
            long recordingId,
            RecordingControlCommand command,
            RecordingAudioSealCommand seal
    ) {
        RecordingSession session = loadForEnd(
                workspaceId,
                memberId,
                recordingId,
                command
        );
        if (seal != null && session.getAudioMode() != RecordingAudioMode.PCM16_CHUNKS_V1) {
            throw new RecordingException(RecordingErrorCode.AUDIO_MODE_CONFLICT);
        }
        Instant endedAt = now();
        boolean expired = expireAndSeal(
                session,
                endedAt
        );
        sealCapture(
                session,
                command,
                seal,
                endedAt,
                expired
        );
        recordingSessionRepository.save(session);
        if (session.getAudioMode() != RecordingAudioMode.PCM16_CHUNKS_V1) {
            return RecordingEndResult.from(session);
        }
        RecordingAudioStream stream = recordingAudioStreamRepository.findByRecordingIdForUpdate(recordingId)
                .orElseThrow(() -> new RecordingException(RecordingErrorCode.RECORDING_NOT_FOUND));
        return new RecordingEndResult(
                session.getId(),
                session.getStatus(),
                session.getEndedAt(),
                new RecordingAudioSealSummary(
                        finalizations.findByRecordingId(recordingId)
                                .map(job -> job.audioSaveStatus())
                                .orElse("DRAINING"),
                        stream.getLastSequence(),
                        stream.getTotalFrameCount(),
                        stream.isTailUnknown(),
                        stream.getAcceptUntil()
                )
        );
    }

    private void normalSeal(
            RecordingSession session,
            RecordingAudioSealCommand seal,
            Instant endedAt
    ) {
        session.validateNotDiscarded();
        RecordingAudioStream stream = recordingAudioStreamRepository.findByRecordingIdForUpdate(session.getId())
                .orElseThrow(() -> new RecordingException(RecordingErrorCode.RECORDING_NOT_FOUND));
        if (stream.isSealed()) {
            stream.validateNormalSeal(
                    seal.lastSequence(),
                    seal.totalFrameCount()
            );
            for (AudioChunkDescriptor descriptor : seal.pendingDescriptors()) {
                chunks.findByRecordingIdAndSequence(
                        session.getId(),
                        descriptor.sequence()
                )
                        .orElseThrow(() -> new RecordingException(RecordingErrorCode.AUDIO_SEAL_CONFLICT))
                        .validateDescriptor(descriptor);
            }
            return;
        }
        for (AudioChunkDescriptor descriptor : seal.pendingDescriptors()) {
            reservePending(
                    session,
                    stream,
                    descriptor,
                    endedAt
            );
        }
        stream.validateNormalSeal(
                seal.lastSequence(),
                seal.totalFrameCount()
        );
        session.end(endedAt);
        stream.seal(
                RecordingAudioSealKind.NORMAL,
                session.getEndedAt()
        );
        recordingAudioStreamRepository.save(stream);
    }

    private RecordingSession loadForEnd(
            long workspaceId,
            long memberId,
            long recordingId,
            RecordingControlCommand command
    ) {
        if (command == null) {
            return recordingAccess.loadOwnedForUpdate(
                    workspaceId,
                    memberId,
                    recordingId
            );
        }
        return recordingAccess.loadControlledForUpdate(
                workspaceId,
                memberId,
                recordingId,
                command
        );
    }

    private void sealCapture(
            RecordingSession session,
            RecordingControlCommand command,
            RecordingAudioSealCommand seal,
            Instant endedAt,
            boolean expired
    ) {
        if (seal == null) {
            session.end(endedAt);
            audioSealing.sealEnded(session);
            return;
        }
        if (command == null) {
            throw new RecordingException(RecordingErrorCode.RECORDING_CONTROL_DENIED);
        }
        if (expired) {
            throw new RecordingAudioCaptureExpiredException();
        }
        normalSeal(
                session,
                seal,
                endedAt
        );
    }

    private void reservePending(
            RecordingSession session,
            RecordingAudioStream stream,
            AudioChunkDescriptor descriptor,
            Instant endedAt
    ) {
        Optional<RecordingAudioChunk> existing = chunks.findByRecordingIdAndSequence(
                session.getId(),
                descriptor.sequence()
        );
        if (existing.isPresent()) {
            existing.orElseThrow()
                    .validateDescriptor(descriptor);
            return;
        }
        stream.reserve(descriptor);
        chunks.save(
                RecordingAudioChunk.reserve(
                        session.getId(),
                        descriptor,
                        "recordings/" + session.getId() + "/chunks/" + descriptor.sequence(),
                        endedAt.plusSeconds(120)
                )
        );
    }

    private boolean expireAndSeal(
            RecordingSession session,
            Instant now
    ) {
        boolean expired = session.expireIfDue(now);
        audioSealing.sealEnded(session);
        return expired;
    }

    @Transactional
    public RecordingHeartbeatResult heartbeat(
            long workspaceId,
            long memberId,
            long recordingId,
            RecordingControlCommand command
    ) {
        RecordingSession session = recordingAccess.loadControlledForUpdate(
                workspaceId,
                memberId,
                recordingId,
                command
        );
        Instant now = now();
        session.recordHeartbeat(now);
        audioSealing.sealEnded(session);
        return RecordingHeartbeatResult.of(
                recordingSessionRepository.save(session),
                now
        );
    }

    private RecordingStartResult replay(
            RecordingSession session,
            long workspaceId,
            RecordingStartCommand command,
            String controlTokenHash
    ) {
        session.validateStartRetry(
                workspaceId,
                command.tabId(),
                controlTokenHash,
                command.audioMode()
        );
        if (session.expireIfDue(now())) {
            audioSealing.sealEnded(session);
            recordingSessionRepository.save(session);
        }
        return RecordingStartResult.from(
                session,
                false
        );
    }

    private void releaseActiveRecordings(long memberId) {
        Instant now = now();
        for (RecordingSession active : recordingSessionRepository.findAllActiveByMemberIdForUpdate(memberId)) {
            active.releaseForNewRecording(now);
            audioSealing.sealEnded(active);
            recordingSessionRepository.save(active);
        }
    }

    private Instant now() {
        return clock.instant()
                .truncatedTo(ChronoUnit.MICROS);
    }
}
