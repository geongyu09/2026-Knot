package com.knot.backend.recording.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.knot.backend.recording.application.dto.command.RecordingControlCommand;
import com.knot.backend.recording.domain.RecordingErrorCode;
import com.knot.backend.recording.domain.RecordingException;
import com.knot.backend.recording.domain.model.RecordingSession;
import com.knot.backend.recording.domain.repository.RecordingSessionRepository;
import com.knot.backend.workspace.domain.model.Workspace;
import com.knot.backend.workspace.domain.WorkspaceErrorCode;
import com.knot.backend.workspace.domain.WorkspaceException;
import com.knot.backend.workspace.domain.repository.WorkspaceMemberRepository;
import com.knot.backend.workspace.domain.repository.WorkspaceRepository;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RecordingAccessTest {
    private static final Instant STARTED_AT = Instant.parse("2026-10-05T00:00:00Z");
    private static final long WORKSPACE_ID = 10L;
    private static final long MEMBER_ID = 1L;
    private static final long RECORDING_ID = 7L;
    private static final UUID TAB_ID = UUID.fromString("22222222-2222-2222-2222-222222222222");
    private static final String CONTROL_TOKEN = "A".repeat(43);
    private static final String HASH = "a".repeat(64);

    private WorkspaceRepository workspaceRepository;
    private WorkspaceMemberRepository workspaceMemberRepository;
    private RecordingSessionRepository recordingSessionRepository;
    private RecordingAccess recordingAccess;

    @BeforeEach
    void setUp() {
        workspaceRepository = mock(WorkspaceRepository.class);
        workspaceMemberRepository = mock(WorkspaceMemberRepository.class);
        recordingSessionRepository = mock(RecordingSessionRepository.class);
        RecordingControlTokenHasher hasher = mock(RecordingControlTokenHasher.class);
        when(hasher.hash(CONTROL_TOKEN)).thenReturn(HASH);
        recordingAccess = new RecordingAccess(
                workspaceRepository,
                workspaceMemberRepository,
                recordingSessionRepository,
                hasher
        );
    }

    @Test
    @DisplayName("조회용 멤버 확인은 Workspace를 잠그지 않는다")
    void validateMember_success_withoutLock() {
        // given
        when(workspaceRepository.findById(WORKSPACE_ID)).thenReturn(Optional.of(workspace()));
        allowMembership();

        // when
        recordingAccess.validateMember(
                WORKSPACE_ID,
                MEMBER_ID
        );

        // then
        verify(
                workspaceRepository,
                never()
        ).findByIdForUpdate(WORKSPACE_ID);
    }

    @Test
    @DisplayName("0 이하 Workspace ID는 저장소를 조회하지 않고 거절한다")
    void lockMember_failure_invalidWorkspaceId() {
        // when
        Throwable failure = catchThrowable(
                () -> recordingAccess.lockMember(
                        0,
                        MEMBER_ID
                )
        );

        // then
        assertThat(failure).isInstanceOf(WorkspaceException.class)
                .extracting("errorCode")
                .isEqualTo(WorkspaceErrorCode.INVALID_WORKSPACE_ID);
        verifyNoInteractions(workspaceRepository);
    }

    @Test
    @DisplayName("Workspace 멤버가 아니면 녹음을 조회하지 않고 거절한다")
    void loadOwnedForUpdate_failure_notMember() {
        // given
        when(workspaceRepository.findByIdForUpdate(WORKSPACE_ID)).thenReturn(Optional.of(workspace()));

        // when
        Throwable failure = catchThrowable(
                () -> recordingAccess.loadOwnedForUpdate(
                        WORKSPACE_ID,
                        MEMBER_ID,
                        RECORDING_ID
                )
        );

        // then
        assertThat(failure).isInstanceOf(WorkspaceException.class)
                .extracting("errorCode")
                .isEqualTo(WorkspaceErrorCode.WORKSPACE_ACCESS_DENIED);
        verifyNoInteractions(recordingSessionRepository);
    }

    @Test
    @DisplayName("0 이하 녹음 ID는 녹음을 조회하지 않고 거절한다")
    void loadOwnedForUpdate_failure_invalidRecordingId() {
        // given
        allowLockedMember();

        // when
        Throwable failure = catchThrowable(
                () -> recordingAccess.loadOwnedForUpdate(
                        WORKSPACE_ID,
                        MEMBER_ID,
                        0
                )
        );

        // then
        assertThat(failure).isInstanceOf(RecordingException.class)
                .extracting("errorCode")
                .isEqualTo(RecordingErrorCode.INVALID_RECORDING_DATA);
        verifyNoInteractions(recordingSessionRepository);
    }

    @Test
    @DisplayName("다른 멤버가 시작한 녹음은 제어 거절로 막는다")
    void loadOwnedForUpdate_failure_notStarter() {
        // given
        allowLockedMember();
        when(recordingSessionRepository.findByIdForUpdate(RECORDING_ID))
                .thenReturn(Optional.of(recordingStartedBy(MEMBER_ID + 1)));

        // when
        Throwable failure = catchThrowable(
                () -> recordingAccess.loadOwnedForUpdate(
                        WORKSPACE_ID,
                        MEMBER_ID,
                        RECORDING_ID
                )
        );

        // then
        assertThat(failure).isInstanceOf(RecordingException.class)
                .extracting("errorCode")
                .isEqualTo(RecordingErrorCode.RECORDING_CONTROL_DENIED);
    }

    @Test
    @DisplayName("최초 탭의 제어 증명이면 시작자의 녹음을 돌려준다")
    void loadControlledForUpdate_success_firstTab() {
        // given
        allowLockedMember();
        RecordingSession session = recordingStartedBy(MEMBER_ID);
        when(recordingSessionRepository.findByIdForUpdate(RECORDING_ID)).thenReturn(Optional.of(session));

        // when
        RecordingSession loaded = recordingAccess.loadControlledForUpdate(
                WORKSPACE_ID,
                MEMBER_ID,
                RECORDING_ID,
                new RecordingControlCommand(
                        TAB_ID,
                        CONTROL_TOKEN
                )
        );

        // then
        assertThat(loaded).isSameAs(session);
    }

    @Test
    @DisplayName("다른 탭의 제어 요청은 시작자라도 제어 거절로 막는다")
    void loadControlledForUpdate_failure_otherTab() {
        // given
        allowLockedMember();
        when(recordingSessionRepository.findByIdForUpdate(RECORDING_ID))
                .thenReturn(Optional.of(recordingStartedBy(MEMBER_ID)));

        // when
        Throwable failure = catchThrowable(
                () -> recordingAccess.loadControlledForUpdate(
                        WORKSPACE_ID,
                        MEMBER_ID,
                        RECORDING_ID,
                        new RecordingControlCommand(
                                UUID.randomUUID(),
                                CONTROL_TOKEN
                        )
                )
        );

        // then
        assertThat(failure).isInstanceOf(RecordingException.class)
                .extracting("errorCode")
                .isEqualTo(RecordingErrorCode.RECORDING_CONTROL_DENIED);
    }

    private void allowLockedMember() {
        when(workspaceRepository.findByIdForUpdate(WORKSPACE_ID)).thenReturn(Optional.of(workspace()));
        allowMembership();
    }

    private void allowMembership() {
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

    private RecordingSession recordingStartedBy(long memberId) {
        return RecordingSession.start(
                WORKSPACE_ID,
                memberId,
                UUID.randomUUID(),
                TAB_ID,
                HASH,
                STARTED_AT
        );
    }
}
