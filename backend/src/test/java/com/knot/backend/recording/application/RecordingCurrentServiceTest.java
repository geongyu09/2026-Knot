package com.knot.backend.recording.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.knot.backend.member.domain.MemberRepository;
import com.knot.backend.recording.application.dto.result.RecordingCurrentResult;
import com.knot.backend.recording.domain.model.RecordingSession;
import com.knot.backend.recording.domain.repository.RecordingSessionRepository;
import com.knot.backend.recording.application.dto.result.CurrentRecordingStatus;
import com.knot.backend.workspace.domain.model.Workspace;
import com.knot.backend.workspace.domain.WorkspaceErrorCode;
import com.knot.backend.workspace.domain.WorkspaceException;
import com.knot.backend.workspace.domain.repository.WorkspaceMemberRepository;
import com.knot.backend.workspace.domain.repository.WorkspaceRepository;
import com.knot.backend.global.config.RecordingAudioChunksProperties;
import com.knot.backend.recording.domain.repository.RecordingAudioStreamRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import com.knot.backend.document.application.dto.result.DocumentGenerationProgressResult;
import com.knot.backend.document.domain.model.DocumentGenerationProcessingStatus;
import com.knot.backend.recording.domain.model.AudioFinalizationStatus;
import com.knot.backend.recording.domain.model.RecordingAudioFinalization;
import com.knot.backend.recording.domain.model.RecordingTranscription;
import com.knot.backend.recording.domain.model.TranscriptionStatus;

class RecordingCurrentServiceTest {
    private static final Instant STARTED_AT = Instant.parse("2026-10-05T00:00:00Z");
    private static final Instant NOW = Instant.parse("2026-10-05T00:10:00.123456Z");
    private static final long WORKSPACE_ID = 10L;
    private static final long MEMBER_ID = 1L;
    private static final long RECORDING_ID = 7L;
    private static final UUID TAB_ID = UUID.fromString("22222222-2222-2222-2222-222222222222");
    private static final String HASH = "a".repeat(64);

    private WorkspaceRepository workspaceRepository;
    private WorkspaceMemberRepository workspaceMemberRepository;
    private RecordingSessionRepository recordingSessionRepository;
    private com.knot.backend.recording.domain.repository.RecordingAudioFinalizationRepository finalizations;
    private com.knot.backend.recording.domain.repository.RecordingTranscriptionRepository transcriptions;
    private com.knot.backend.document.application.DocumentGenerationProgressService documentProgress;
    private RecordingService service;

    @BeforeEach
    void setUp() {
        workspaceRepository = mock(WorkspaceRepository.class);
        workspaceMemberRepository = mock(WorkspaceMemberRepository.class);
        recordingSessionRepository = mock(RecordingSessionRepository.class);
        finalizations = mock(com.knot.backend.recording.domain.repository.RecordingAudioFinalizationRepository.class);
        transcriptions = mock(com.knot.backend.recording.domain.repository.RecordingTranscriptionRepository.class);
        documentProgress = mock(com.knot.backend.document.application.DocumentGenerationProgressService.class);
        service = new RecordingService(
                new RecordingAccess(
                        workspaceRepository,
                        workspaceMemberRepository,
                        recordingSessionRepository,
                        mock(RecordingControlTokenHasher.class)
                ),
                mock(MemberRepository.class),
                recordingSessionRepository,
                mock(RecordingControlTokenHasher.class),
                Clock.fixed(
                        NOW,
                        ZoneOffset.UTC
                ),
                mock(RecordingAudioSealing.class),
                mock(RecordingAudioStreamRepository.class),
                new RecordingAudioChunksProperties(false),
                mock(com.knot.backend.recording.domain.repository.RecordingAudioChunkRepository.class),
                finalizations,
                mock(com.knot.backend.recording.domain.repository.RecordingAudioCleanupRepository.class),
                transcriptions,
                documentProgress
        );
    }

    @Test
    @DisplayName("진행 중인 본인 녹음은 서버 시각까지의 누적 시간과 함께 반환한다")
    void findCurrent_success_recording() {
        // given
        prepareAccess();
        RecordingSession session = recordingSession();
        when(
                recordingSessionRepository.findLatestByWorkspaceIdAndMemberId(
                        WORKSPACE_ID,
                        MEMBER_ID
                )
        ).thenReturn(Optional.of(session));

        // when
        Optional<RecordingCurrentResult> result = service.findCurrent(
                WORKSPACE_ID,
                MEMBER_ID
        );

        // then
        assertThat(result).contains(
                new RecordingCurrentResult(
                        RECORDING_ID,
                        CurrentRecordingStatus.RECORDING,
                        STARTED_AT,
                        600_123L
                )
        );
    }

    @Test
    @DisplayName("일시정지한 녹음은 일시정지 이후 시간을 누적 시간에 더하지 않는다")
    void findCurrent_success_pausedExcludesPausedTime() {
        // given
        prepareAccess();
        RecordingSession session = recordingSession();
        session.pause(STARTED_AT.plusSeconds(20));
        when(
                recordingSessionRepository.findLatestByWorkspaceIdAndMemberId(
                        WORKSPACE_ID,
                        MEMBER_ID
                )
        ).thenReturn(Optional.of(session));

        // when
        Optional<RecordingCurrentResult> result = service.findCurrent(
                WORKSPACE_ID,
                MEMBER_ID
        );

        // then
        assertThat(result).hasValueSatisfying(current -> {
            assertThat(current.status()).isEqualTo(CurrentRecordingStatus.PAUSED);
            assertThat(current.elapsedMillis()).isEqualTo(20_000L);
        });
    }

    @Test
    @DisplayName("현재 시각을 확인하기 전에 다른 요청이 재개를 커밋해도 읽은 녹음 기준으로 누적 시간을 계산한다")
    void findCurrent_success_resumeCommittedBeforeRead() {
        // given
        prepareAccess();
        AtomicReference<Instant> currentTime = new AtomicReference<>(NOW);
        Clock clock = mock(Clock.class);
        when(clock.instant()).thenAnswer(invocation -> currentTime.get());
        Instant resumedAt = NOW.plusMillis(2);
        RecordingSession session = recordingSession();
        session.pause(STARTED_AT.plusSeconds(20));
        keepAlive(
                session,
                NOW
        );
        when(
                recordingSessionRepository.findLatestByWorkspaceIdAndMemberId(
                        WORKSPACE_ID,
                        MEMBER_ID
                )
        ).thenAnswer(invocation -> {
            session.resume(resumedAt);
            currentTime.set(resumedAt.plusMillis(1));
            return Optional.of(session);
        });
        RecordingService racingService = new RecordingService(
                new RecordingAccess(
                        workspaceRepository,
                        workspaceMemberRepository,
                        recordingSessionRepository,
                        mock(RecordingControlTokenHasher.class)
                ),
                mock(MemberRepository.class),
                recordingSessionRepository,
                mock(RecordingControlTokenHasher.class),
                clock,
                mock(RecordingAudioSealing.class),
                mock(RecordingAudioStreamRepository.class),
                new RecordingAudioChunksProperties(false),
                mock(com.knot.backend.recording.domain.repository.RecordingAudioChunkRepository.class),
                finalizations,
                mock(com.knot.backend.recording.domain.repository.RecordingAudioCleanupRepository.class),
                transcriptions,
                documentProgress
        );

        // when
        Optional<RecordingCurrentResult> result = racingService.findCurrent(
                WORKSPACE_ID,
                MEMBER_ID
        );

        // then
        assertThat(result).hasValueSatisfying(current -> {
            assertThat(current.status()).isEqualTo(CurrentRecordingStatus.RECORDING);
            assertThat(current.elapsedMillis()).isEqualTo(20_001L);
        });
    }

    @Test
    @DisplayName("요청 Workspace에 본인 녹음이 없으면 빈 결과를 반환한다")
    void findCurrent_success_noRecording() {
        // given
        prepareAccess();
        when(
                recordingSessionRepository.findLatestByWorkspaceIdAndMemberId(
                        WORKSPACE_ID,
                        MEMBER_ID
                )
        ).thenReturn(Optional.empty());

        // when
        Optional<RecordingCurrentResult> result = service.findCurrent(
                WORKSPACE_ID,
                MEMBER_ID
        );

        // then
        assertThat(result).isEmpty();
    }

    @Test
    @DisplayName("조회는 Workspace를 잠그지 않고 녹음 세션을 저장하지 않는다")
    void findCurrent_success_readsWithoutLockOrSave() {
        // given
        prepareAccess();
        RecordingSession session = recordingSession();
        when(
                recordingSessionRepository.findLatestByWorkspaceIdAndMemberId(
                        WORKSPACE_ID,
                        MEMBER_ID
                )
        ).thenReturn(Optional.of(session));

        // when
        service.findCurrent(
                WORKSPACE_ID,
                MEMBER_ID
        );

        // then
        verify(
                workspaceRepository,
                never()
        ).findByIdForUpdate(WORKSPACE_ID);
        verify(
                recordingSessionRepository,
                never()
        ).save(session);
        assertThat(session.getLastSeenAt()).isEqualTo(STARTED_AT);
    }

    @Test
    @DisplayName("Workspace 멤버가 아니면 녹음을 조회하지 않고 거절한다")
    void findCurrent_failure_notWorkspaceMember() {
        // given
        when(workspaceRepository.findById(WORKSPACE_ID)).thenReturn(Optional.of(workspace()));
        when(
                workspaceMemberRepository.existsByWorkspaceIdAndMemberId(
                        WORKSPACE_ID,
                        MEMBER_ID
                )
        ).thenReturn(false);

        // when
        Throwable failure = catchThrowable(
                () -> service.findCurrent(
                        WORKSPACE_ID,
                        MEMBER_ID
                )
        );

        // then
        assertThat(failure).isInstanceOf(WorkspaceException.class)
                .extracting("errorCode")
                .isEqualTo(WorkspaceErrorCode.WORKSPACE_ACCESS_DENIED);
        verifyNoInteractions(recordingSessionRepository);
    }

    @Test
    @DisplayName("없거나 삭제된 Workspace면 WORKSPACE_NOT_FOUND로 거절한다")
    void findCurrent_failure_workspaceNotFound() {
        // given
        when(workspaceRepository.findById(WORKSPACE_ID)).thenReturn(Optional.empty());

        // when
        Throwable failure = catchThrowable(
                () -> service.findCurrent(
                        WORKSPACE_ID,
                        MEMBER_ID
                )
        );

        // then
        assertThat(failure).isInstanceOf(WorkspaceException.class)
                .extracting("errorCode")
                .isEqualTo(WorkspaceErrorCode.WORKSPACE_NOT_FOUND);
        verifyNoInteractions(recordingSessionRepository);
    }

    @Test
    @DisplayName("0 이하 Workspace ID는 저장소를 조회하지 않고 INVALID_WORKSPACE_ID로 거절한다")
    void findCurrent_failure_invalidWorkspaceId() {
        // given
        long invalidWorkspaceId = 0L;

        // when
        Throwable failure = catchThrowable(
                () -> service.findCurrent(
                        invalidWorkspaceId,
                        MEMBER_ID
                )
        );

        // then
        assertThat(failure).isInstanceOf(WorkspaceException.class)
                .extracting("errorCode")
                .isEqualTo(WorkspaceErrorCode.INVALID_WORKSPACE_ID);
        verifyNoInteractions(workspaceRepository);
        verify(
                recordingSessionRepository,
                never()
        ).findLatestByWorkspaceIdAndMemberId(
                anyLong(),
                anyLong()
        );
    }

    @Test
    @DisplayName("종료 직후 업로드와 처리 결과가 없으면 문서 생성 중으로 반환한다")
    void findCurrent_success_waitingForAudio() {
        // given
        prepareEndedRecording();

        // when
        Optional<RecordingCurrentResult> result = service.findCurrent(
                WORKSPACE_ID,
                MEMBER_ID
        );

        // then
        assertThat(result).hasValueSatisfying(current -> {
            assertThat(current.status()).isEqualTo(CurrentRecordingStatus.PROCESSING);
            assertThat(current.elapsedMillis()).isEqualTo(20_000L);
        });
    }

    @ParameterizedTest
    @EnumSource(value = DocumentGenerationProcessingStatus.class, names = {"QUEUED", "RUNNING"})
    @DisplayName("문서 생성 배치가 대기 또는 실행 중이면 문서 생성 중으로 반환한다")
    void findCurrent_success_documentGenerationInProgress(DocumentGenerationProcessingStatus status) {
        // given
        prepareEndedRecording();
        when(
                documentProgress.findProgress(
                        WORKSPACE_ID,
                        RECORDING_ID
                )
        ).thenReturn(Optional.of(progress(status)));

        // when
        Optional<RecordingCurrentResult> result = service.findCurrent(
                WORKSPACE_ID,
                MEMBER_ID
        );

        // then
        assertThat(result).hasValueSatisfying(
                current -> assertThat(current.status()).isEqualTo(CurrentRecordingStatus.PROCESSING)
        );
    }

    @ParameterizedTest
    @EnumSource(value = DocumentGenerationProcessingStatus.class, names = {"SUCCEEDED", "FAILED", "NO_CONTENT"})
    @DisplayName("문서 생성 배치가 최종 상태면 최신 녹음을 표시하지 않는다")
    void findCurrent_success_terminalDocumentGeneration(DocumentGenerationProcessingStatus status) {
        // given
        prepareEndedRecording();
        when(
                documentProgress.findProgress(
                        WORKSPACE_ID,
                        RECORDING_ID
                )
        ).thenReturn(Optional.of(progress(status)));

        // when
        Optional<RecordingCurrentResult> result = service.findCurrent(
                WORKSPACE_ID,
                MEMBER_ID
        );

        // then
        assertThat(result).isEmpty();
        verify(
                recordingSessionRepository,
                never()
        ).findActiveByWorkspaceIdAndMemberId(
                anyLong(),
                anyLong()
        );
    }

    @ParameterizedTest
    @EnumSource(value = TranscriptionStatus.class, names = {"QUEUED", "PROCESSING", "SUCCEEDED"})
    @DisplayName("문서 배치 없이 전사 작업이 진행되거나 배치 생성을 기다리면 문서 생성 중이다")
    void findCurrent_success_transcriptionInProgress(TranscriptionStatus status) {
        // given
        prepareEndedRecording();
        RecordingTranscription transcription = mock(RecordingTranscription.class);
        when(transcription.getStatus()).thenReturn(status);
        when(transcriptions.findByRecordingSessionId(RECORDING_ID)).thenReturn(Optional.of(transcription));

        // when
        Optional<RecordingCurrentResult> result = service.findCurrent(
                WORKSPACE_ID,
                MEMBER_ID
        );

        // then
        assertThat(result).hasValueSatisfying(
                current -> assertThat(current.status()).isEqualTo(CurrentRecordingStatus.PROCESSING)
        );
    }

    @Test
    @DisplayName("전사가 최종 실패한 최신 녹음은 문서 생성 중으로 표시하지 않는다")
    void findCurrent_success_failedTranscriptionExcluded() {
        // given
        prepareEndedRecording();
        RecordingTranscription transcription = mock(RecordingTranscription.class);
        when(transcription.getStatus()).thenReturn(TranscriptionStatus.FAILED);
        when(transcriptions.findByRecordingSessionId(RECORDING_ID)).thenReturn(Optional.of(transcription));

        // when
        Optional<RecordingCurrentResult> result = service.findCurrent(
                WORKSPACE_ID,
                MEMBER_ID
        );

        // then
        assertThat(result).isEmpty();
    }

    @ParameterizedTest
    @EnumSource(value = AudioFinalizationStatus.class, names = {"QUEUED", "PROCESSING", "READY"})
    @DisplayName("오디오 준비 또는 전사 대기 중인 최신 녹음은 문서 생성 중으로 반환한다")
    void findCurrent_success_audioInProgress(AudioFinalizationStatus status) {
        // given
        prepareEndedRecording();
        RecordingAudioFinalization finalization = mock(RecordingAudioFinalization.class);
        when(finalization.getStatus()).thenReturn(status);
        when(finalizations.findByRecordingId(RECORDING_ID)).thenReturn(Optional.of(finalization));

        // when
        Optional<RecordingCurrentResult> result = service.findCurrent(
                WORKSPACE_ID,
                MEMBER_ID
        );

        // then
        assertThat(result).hasValueSatisfying(
                current -> assertThat(current.status()).isEqualTo(CurrentRecordingStatus.PROCESSING)
        );
    }

    @ParameterizedTest
    @EnumSource(value = AudioFinalizationStatus.class, names = {"FAILED", "DISCARDED"})
    @DisplayName("오디오 준비가 실패하거나 폐기되면 문서 생성 중으로 표시하지 않는다")
    void findCurrent_success_terminalAudioExcluded(AudioFinalizationStatus status) {
        // given
        prepareEndedRecording();
        RecordingAudioFinalization finalization = mock(RecordingAudioFinalization.class);
        when(finalization.getStatus()).thenReturn(status);
        when(finalizations.findByRecordingId(RECORDING_ID)).thenReturn(Optional.of(finalization));

        // when
        Optional<RecordingCurrentResult> result = service.findCurrent(
                WORKSPACE_ID,
                MEMBER_ID
        );

        // then
        assertThat(result).isEmpty();
    }

    @Test
    @DisplayName("폐기된 최신 녹음은 표시하지 않고 처리 상태도 조회하지 않는다")
    void findCurrent_success_discardedExcluded() {
        // given
        prepareAccess();
        RecordingSession session = recordingSession();
        session.discard(STARTED_AT.plusSeconds(20));
        when(
                recordingSessionRepository.findLatestByWorkspaceIdAndMemberId(
                        WORKSPACE_ID,
                        MEMBER_ID
                )
        ).thenReturn(Optional.of(session));

        // when
        Optional<RecordingCurrentResult> result = service.findCurrent(
                WORKSPACE_ID,
                MEMBER_ID
        );

        // then
        assertThat(result).isEmpty();
        verifyNoInteractions(
                transcriptions,
                finalizations,
                documentProgress
        );
    }

    private void prepareEndedRecording() {
        prepareAccess();
        RecordingSession session = recordingSession();
        session.end(STARTED_AT.plusSeconds(20));
        when(
                recordingSessionRepository.findLatestByWorkspaceIdAndMemberId(
                        WORKSPACE_ID,
                        MEMBER_ID
                )
        ).thenReturn(Optional.of(session));
    }

    private DocumentGenerationProgressResult progress(DocumentGenerationProcessingStatus status) {
        return new DocumentGenerationProgressResult(
                100L,
                RECORDING_ID,
                status,
                0,
                0,
                0,
                0,
                null,
                null
        );
    }

    private void prepareAccess() {
        when(workspaceRepository.findById(WORKSPACE_ID)).thenReturn(Optional.of(workspace()));
        when(
                workspaceMemberRepository.existsByWorkspaceIdAndMemberId(
                        WORKSPACE_ID,
                        MEMBER_ID
                )
        ).thenReturn(true);
    }

    private Workspace workspace() {
        return Workspace.create(
                "Knot 팀",
                STARTED_AT
        );
    }

    private RecordingSession recordingSession() {
        RecordingSession session = spy(
                RecordingSession.start(
                        WORKSPACE_ID,
                        MEMBER_ID,
                        UUID.randomUUID(),
                        TAB_ID,
                        HASH,
                        STARTED_AT
                )
        );
        doReturn(RECORDING_ID).when(session)
                .getId();
        return session;
    }

    private void keepAlive(
            RecordingSession session,
            Instant until
    ) {
        for (Instant at = session.getLastSeenAt()
                .plusSeconds(10); at.isBefore(until); at = at.plusSeconds(10)) {
            session.recordHeartbeat(at);
        }
    }
}
