package com.knot.backend.workspace.domain.model;

import com.knot.backend.workspace.domain.WorkspaceErrorCode;
import com.knot.backend.workspace.domain.WorkspaceException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class WorkspaceMemberTest {
    private static final Instant JOINED_AT = Instant.parse("2026-08-24T00:00:00Z");

    @DisplayName("활성 OWNER가 활성 MEMBER에게 승계하면 대상은 OWNER가 되고 요청자는 탈퇴한다")
    @Test
    void transferOwnershipTo_success() {
        // given
        WorkspaceMember owner = activeMember(
                2L,
                WorkspaceMemberRole.OWNER
        );
        owner.markLastViewed();
        WorkspaceMember successor = activeMember(
                3L,
                WorkspaceMemberRole.MEMBER
        );
        successor.markLastViewed();
        Instant leftAt = JOINED_AT.plusSeconds(1);

        // when
        owner.transferOwnershipTo(
                successor,
                leftAt
        );

        // then
        assertThat(successor.getRole()).isEqualTo(WorkspaceMemberRole.OWNER);
        assertThat(successor.isActive()).isTrue();
        assertThat(successor.isLastViewed()).isTrue();
        assertThat(successor.getJoinedAt()).isEqualTo(JOINED_AT);
        assertThat(owner.getRole()).isEqualTo(WorkspaceMemberRole.OWNER);
        assertThat(owner.getLeftAt()).isEqualTo(leftAt);
        assertThat(owner.isLastViewed()).isFalse();
        assertThat(owner.isActive()).isFalse();
    }

    @DisplayName("본인에게 승계하면 본인 지정 오류로 거부하고 상태를 바꾸지 않는다")
    @Test
    void transferOwnershipTo_failure_self() {
        // given
        WorkspaceMember owner = activeMember(
                2L,
                WorkspaceMemberRole.OWNER
        );

        // when
        ThrowingCallable action = () -> owner.transferOwnershipTo(
                owner,
                JOINED_AT.plusSeconds(1)
        );

        // then
        assertThatThrownBy(action).isInstanceOf(WorkspaceException.class)
                .extracting(exception -> ((WorkspaceException) exception).getErrorCode())
                .isEqualTo(WorkspaceErrorCode.INVALID_WORKSPACE_OWNERSHIP_TRANSFER_TARGET);
        assertThat(owner.getRole()).isEqualTo(WorkspaceMemberRole.OWNER);
        assertThat(owner.isActive()).isTrue();
    }

    @DisplayName("활성 OWNER가 아닌 요청자는 승계할 수 없다")
    @ParameterizedTest
    @ValueSource(strings = {"member", "leftOwner"})
    void transferOwnershipTo_failure_notActiveOwner(String actorState) {
        // given
        WorkspaceMember actor = actor(actorState);
        WorkspaceMember successor = activeMember(
                3L,
                WorkspaceMemberRole.MEMBER
        );

        // when
        ThrowingCallable action = () -> actor.transferOwnershipTo(
                successor,
                JOINED_AT.plusSeconds(2)
        );

        // then
        assertThatThrownBy(action).isInstanceOf(WorkspaceException.class)
                .extracting(exception -> ((WorkspaceException) exception).getErrorCode())
                .isEqualTo(WorkspaceErrorCode.WORKSPACE_OWNER_REQUIRED);
        assertThat(successor.getRole()).isEqualTo(WorkspaceMemberRole.MEMBER);
    }

    @DisplayName("승계 대상이 같은 워크스페이스의 활성 MEMBER가 아니면 승계를 거부하고 상태를 바꾸지 않는다")
    @ParameterizedTest
    @ValueSource(strings = {"missing", "otherWorkspace", "owner", "leftMember"})
    void transferOwnershipTo_failure_invalidSuccessor(String successorState) {
        // given
        WorkspaceMember owner = activeMember(
                2L,
                WorkspaceMemberRole.OWNER
        );
        owner.markLastViewed();
        WorkspaceMember successor = successor(successorState);

        // when
        ThrowingCallable action = () -> owner.transferOwnershipTo(
                successor,
                JOINED_AT.plusSeconds(2)
        );

        // then
        assertThatThrownBy(action).isInstanceOf(WorkspaceException.class)
                .extracting(exception -> ((WorkspaceException) exception).getErrorCode())
                .isEqualTo(WorkspaceErrorCode.WORKSPACE_OWNERSHIP_TRANSFER_TARGET_CONFLICT);
        assertThat(owner.isActive()).isTrue();
        assertThat(owner.isLastViewed()).isTrue();
    }

    @DisplayName("승계 시각이 참여 시각보다 빠르면 대상 역할과 요청자 상태를 바꾸지 않는다")
    @Test
    void transferOwnershipTo_failure_leftAtBeforeJoinedAt() {
        // given
        WorkspaceMember owner = activeMember(
                2L,
                WorkspaceMemberRole.OWNER
        );
        WorkspaceMember successor = activeMember(
                3L,
                WorkspaceMemberRole.MEMBER
        );

        // when
        ThrowingCallable action = () -> owner.transferOwnershipTo(
                successor,
                JOINED_AT.minusSeconds(1)
        );

        // then
        assertThatThrownBy(action).isInstanceOf(WorkspaceException.class)
                .extracting(exception -> ((WorkspaceException) exception).getErrorCode())
                .isEqualTo(WorkspaceErrorCode.INVALID_WORKSPACE_MEMBER_LEFT_AT);
        assertThat(successor.getRole()).isEqualTo(WorkspaceMemberRole.MEMBER);
        assertThat(owner.isActive()).isTrue();
    }

    @DisplayName("워크스페이스와 멤버 식별자 및 역할로 멤버십을 생성한다")
    @Test
    void create_success() {
        // given
        Long workspaceId = 1L;
        Long memberId = 2L;

        // when
        WorkspaceMember workspaceMember = WorkspaceMember.create(
                workspaceId,
                memberId,
                WorkspaceMemberRole.OWNER,
                JOINED_AT
        );

        // then
        assertThat(workspaceMember.getWorkspaceId()).isEqualTo(workspaceId);
        assertThat(workspaceMember.getMemberId()).isEqualTo(memberId);
        assertThat(workspaceMember.getRole()).isEqualTo(WorkspaceMemberRole.OWNER);
        assertThat(workspaceMember.getJoinedAt()).isEqualTo(JOINED_AT);
        assertThat(workspaceMember.isLastViewed()).isFalse();
    }

    @DisplayName("마지막으로 본 워크스페이스 멤버십으로 표시한다")
    @Test
    void markLastViewed_success() {
        // given
        WorkspaceMember workspaceMember = WorkspaceMember.create(
                1L,
                2L,
                WorkspaceMemberRole.OWNER,
                JOINED_AT
        );

        // when
        workspaceMember.markLastViewed();

        // then
        assertThat(workspaceMember.isLastViewed()).isTrue();
    }

    @DisplayName("마지막으로 본 워크스페이스 멤버십 표시를 해제한다")
    @Test
    void clearLastViewed_success() {
        // given
        WorkspaceMember workspaceMember = WorkspaceMember.create(
                1L,
                2L,
                WorkspaceMemberRole.OWNER,
                JOINED_AT
        );
        workspaceMember.markLastViewed();

        // when
        workspaceMember.clearLastViewed();

        // then
        assertThat(workspaceMember.isLastViewed()).isFalse();
    }

    @DisplayName("멤버십을 탈퇴 상태로 바꾸면 마지막 조회 상태도 해제한다")
    @Test
    void leave_success() {
        // given
        WorkspaceMember workspaceMember = WorkspaceMember.create(
                1L,
                2L,
                WorkspaceMemberRole.MEMBER,
                JOINED_AT
        );
        workspaceMember.markLastViewed();
        Instant leftAt = JOINED_AT.plusSeconds(1);

        // when
        workspaceMember.leave(
                leftAt,
                2L
        );

        // then
        assertThat(workspaceMember.isActive()).isFalse();
        assertThat(workspaceMember.getLeftAt()).isEqualTo(leftAt);
        assertThat(workspaceMember.isLastViewed()).isFalse();
    }

    @DisplayName("이미 탈퇴한 멤버십에 다시 탈퇴를 요청하면 기존 탈퇴 시각을 유지한다")
    @Test
    void leave_success_alreadyLeft() {
        // given
        WorkspaceMember workspaceMember = WorkspaceMember.create(
                1L,
                2L,
                WorkspaceMemberRole.MEMBER,
                JOINED_AT
        );
        Instant firstLeftAt = JOINED_AT.plusSeconds(1);
        Instant secondLeftAt = JOINED_AT.plusSeconds(2);
        workspaceMember.leave(
                firstLeftAt,
                2L
        );

        // when
        workspaceMember.leave(
                secondLeftAt,
                2L
        );

        // then
        assertThat(workspaceMember.getLeftAt()).isEqualTo(firstLeftAt);
    }

    @DisplayName("다른 활성 멤버가 있는 OWNER는 일반 탈퇴할 수 없다")
    @Test
    void leave_failure_ownerWithOtherActiveMember() {
        // given
        WorkspaceMember workspaceMember = WorkspaceMember.create(
                1L,
                2L,
                WorkspaceMemberRole.OWNER,
                JOINED_AT
        );
        Instant leftAt = JOINED_AT.plusSeconds(1);

        // when
        ThrowingCallable action = () -> workspaceMember.leave(
                leftAt,
                2L
        );

        // then
        assertThatThrownBy(action).isInstanceOf(WorkspaceException.class)
                .extracting(exception -> ((WorkspaceException) exception).getErrorCode())
                .isEqualTo(WorkspaceErrorCode.WORKSPACE_OWNER_TRANSFER_REQUIRED);
    }

    @DisplayName("탈퇴 시각이 참여 시각보다 빠르면 멤버십 탈퇴를 거부한다")
    @Test
    void leave_failure_leftAtBeforeJoinedAt() {
        // given
        WorkspaceMember workspaceMember = WorkspaceMember.create(
                1L,
                2L,
                WorkspaceMemberRole.MEMBER,
                JOINED_AT
        );
        Instant leftAtBeforeJoinedAt = JOINED_AT.minusSeconds(1);

        // when
        ThrowingCallable action = () -> workspaceMember.leave(
                leftAtBeforeJoinedAt,
                1L
        );

        // then
        assertThatThrownBy(action).isInstanceOf(WorkspaceException.class)
                .extracting(exception -> ((WorkspaceException) exception).getErrorCode())
                .isEqualTo(WorkspaceErrorCode.INVALID_WORKSPACE_MEMBER_LEFT_AT);
    }

    @DisplayName("활성 멤버 수가 양수가 아니면 멤버십 탈퇴를 거부한다")
    @Test
    void leave_failure_invalidActiveMemberCount() {
        // given
        WorkspaceMember workspaceMember = WorkspaceMember.create(
                1L,
                2L,
                WorkspaceMemberRole.MEMBER,
                JOINED_AT
        );
        Instant leftAt = JOINED_AT.plusSeconds(1);

        // when
        ThrowingCallable action = () -> workspaceMember.leave(
                leftAt,
                0L
        );

        // then
        assertThatThrownBy(action).isInstanceOf(WorkspaceException.class)
                .extracting(exception -> ((WorkspaceException) exception).getErrorCode())
                .isEqualTo(WorkspaceErrorCode.INVALID_WORKSPACE_MEMBER_ACTIVE_COUNT);
    }

    @DisplayName("탈퇴한 멤버십은 마지막 조회 상태로 표시할 수 없다")
    @Test
    void markLastViewed_failure_leftMembership() {
        // given
        WorkspaceMember workspaceMember = WorkspaceMember.create(
                1L,
                2L,
                WorkspaceMemberRole.MEMBER,
                JOINED_AT
        );
        workspaceMember.leave(
                JOINED_AT.plusSeconds(1),
                2L
        );

        // when
        ThrowingCallable action = workspaceMember::markLastViewed;

        // then
        assertThatThrownBy(action).isInstanceOf(WorkspaceException.class)
                .extracting(exception -> ((WorkspaceException) exception).getErrorCode())
                .isEqualTo(WorkspaceErrorCode.WORKSPACE_MEMBER_ALREADY_LEFT);
    }

    @DisplayName("워크스페이스 ID가 양수가 아니면 멤버십 생성을 거부한다")
    @Test
    void create_failure_invalidWorkspaceId() {
        // given
        Long invalidWorkspaceId = 0L;

        // when
        ThrowingCallable action = () -> WorkspaceMember.create(
                invalidWorkspaceId,
                1L,
                WorkspaceMemberRole.MEMBER,
                JOINED_AT
        );

        // then
        assertThatThrownBy(action).isInstanceOf(WorkspaceException.class)
                .extracting(exception -> ((WorkspaceException) exception).getErrorCode())
                .isEqualTo(WorkspaceErrorCode.INVALID_WORKSPACE_ID);
    }

    @DisplayName("멤버 ID가 양수가 아니면 멤버십 생성을 거부한다")
    @Test
    void create_failure_invalidMemberId() {
        // given
        Long invalidMemberId = 0L;

        // when
        ThrowingCallable action = () -> WorkspaceMember.create(
                1L,
                invalidMemberId,
                WorkspaceMemberRole.MEMBER,
                JOINED_AT
        );

        // then
        assertThatThrownBy(action).isInstanceOf(WorkspaceException.class)
                .extracting(exception -> ((WorkspaceException) exception).getErrorCode())
                .isEqualTo(WorkspaceErrorCode.INVALID_MEMBER_ID);
    }

    @DisplayName("역할이 없으면 멤버십 생성을 거부한다")
    @Test
    void create_failure_missingRole() {
        // given
        WorkspaceMemberRole missingRole = null;

        // when
        ThrowingCallable action = () -> WorkspaceMember.create(
                1L,
                1L,
                missingRole,
                JOINED_AT
        );

        // then
        assertThatThrownBy(action).isInstanceOf(WorkspaceException.class)
                .extracting(exception -> ((WorkspaceException) exception).getErrorCode())
                .isEqualTo(WorkspaceErrorCode.INVALID_WORKSPACE_MEMBER_ROLE);
    }

    @DisplayName("참여 시각이 없으면 멤버십 생성을 거부한다")
    @Test
    void create_failure_missingJoinedAt() {
        // given
        Instant missingJoinedAt = null;

        // when
        ThrowingCallable action = () -> WorkspaceMember.create(
                1L,
                1L,
                WorkspaceMemberRole.MEMBER,
                missingJoinedAt
        );

        // then
        assertThatThrownBy(action).isInstanceOf(WorkspaceException.class)
                .extracting(exception -> ((WorkspaceException) exception).getErrorCode())
                .isEqualTo(WorkspaceErrorCode.INVALID_WORKSPACE_MEMBER_JOINED_AT);
    }

    private WorkspaceMember activeMember(
            long memberId,
            WorkspaceMemberRole role
    ) {
        return WorkspaceMember.create(
                1L,
                memberId,
                role,
                JOINED_AT
        );
    }

    private WorkspaceMember actor(String actorState) {
        if (actorState.equals("member")) {
            return activeMember(
                    2L,
                    WorkspaceMemberRole.MEMBER
            );
        }
        WorkspaceMember leftOwner = activeMember(
                2L,
                WorkspaceMemberRole.OWNER
        );
        leftOwner.leave(
                JOINED_AT.plusSeconds(1),
                1L
        );
        return leftOwner;
    }

    private WorkspaceMember successor(String successorState) {
        return switch (successorState) {
            case "missing" -> null;
            case "otherWorkspace" -> WorkspaceMember.create(
                    2L,
                    3L,
                    WorkspaceMemberRole.MEMBER,
                    JOINED_AT
            );
            case "owner" -> activeMember(
                    3L,
                    WorkspaceMemberRole.OWNER
            );
            default -> leftMember();
        };
    }

    private WorkspaceMember leftMember() {
        WorkspaceMember member = activeMember(
                3L,
                WorkspaceMemberRole.MEMBER
        );
        member.leave(
                JOINED_AT.plusSeconds(1),
                2L
        );
        return member;
    }
}
