package com.knot.backend.workspace.domain.model;

import com.knot.backend.workspace.domain.WorkspaceErrorCode;
import com.knot.backend.workspace.domain.WorkspaceException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.Field;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class WorkspaceInvitationTest {
    private static final Instant CREATED_AT = Instant.parse("2026-08-29T00:00:00Z");
    private static final Instant CREATED_AT_WITH_NANOS = Instant.parse("2026-08-29T00:00:00.123456789Z");
    private static final String LINK_TOKEN_HASH = "link-token-hash";
    private static final String INVITE_CODE_HASH = "invite-code-hash";

    @DisplayName("링크 토큰 해시와 초대 코드 해시로 24시간짜리 워크스페이스 초대를 생성한다")
    @Test
    void create_success() {
        // given
        Long workspaceId = 1L;

        // when
        WorkspaceInvitation invitation = WorkspaceInvitation.create(
                workspaceId,
                LINK_TOKEN_HASH,
                INVITE_CODE_HASH,
                CREATED_AT
        );

        // then
        assertThat(invitation.getWorkspaceId()).isEqualTo(workspaceId);
        assertThat(invitation.getLinkTokenHash()).isEqualTo(LINK_TOKEN_HASH);
        assertThat(invitation.getInviteCodeHash()).isEqualTo(INVITE_CODE_HASH);
        assertThat(invitation.getExpiresAt()).isEqualTo(CREATED_AT.plus(WorkspaceInvitation.VALIDITY_PERIOD));
        assertThat(invitation.getInvalidatedAt()).isNull();
        assertThat(invitation.getCreatedAt()).isEqualTo(CREATED_AT);
    }

    @DisplayName("초대 생성 시각은 PostgreSQL TIMESTAMPTZ와 같은 마이크로초 정밀도로 보정한다")
    @Test
    void create_success_truncatesCreatedAtToMicroseconds() {
        // given
        Instant expectedCreatedAt = CREATED_AT_WITH_NANOS.truncatedTo(ChronoUnit.MICROS);

        // when
        WorkspaceInvitation invitation = WorkspaceInvitation.create(
                1L,
                LINK_TOKEN_HASH,
                INVITE_CODE_HASH,
                CREATED_AT_WITH_NANOS
        );

        // then
        assertThat(invitation.getCreatedAt()).isEqualTo(expectedCreatedAt);
        assertThat(invitation.getExpiresAt()).isEqualTo(expectedCreatedAt.plus(WorkspaceInvitation.VALIDITY_PERIOD));
    }

    @DisplayName("워크스페이스 ID가 양수가 아니면 초대 생성을 거부한다")
    @Test
    void create_failure_invalidWorkspaceId() {
        // given
        Long invalidWorkspaceId = 0L;

        // when
        ThrowingCallable action = () -> WorkspaceInvitation.create(
                invalidWorkspaceId,
                LINK_TOKEN_HASH,
                INVITE_CODE_HASH,
                CREATED_AT
        );

        // then
        assertThatThrownBy(action).isInstanceOf(WorkspaceException.class)
                .extracting(exception -> ((WorkspaceException) exception).getErrorCode())
                .isEqualTo(WorkspaceErrorCode.INVALID_WORKSPACE_ID);
    }

    @DisplayName("링크 토큰 해시가 비어 있으면 초대 생성을 거부한다")
    @Test
    void create_failure_blankLinkTokenHash() {
        // given
        String blankLinkTokenHash = " ";

        // when
        ThrowingCallable action = () -> WorkspaceInvitation.create(
                1L,
                blankLinkTokenHash,
                INVITE_CODE_HASH,
                CREATED_AT
        );

        // then
        assertThatThrownBy(action).isInstanceOf(WorkspaceException.class)
                .extracting(exception -> ((WorkspaceException) exception).getErrorCode())
                .isEqualTo(WorkspaceErrorCode.INVALID_WORKSPACE_INVITATION_LINK_TOKEN_HASH);
    }

    @DisplayName("링크 토큰 해시가 저장 길이를 넘으면 초대 생성을 거부한다")
    @Test
    void create_failure_tooLongLinkTokenHash() {
        // given
        String tooLongLinkTokenHash = "a".repeat(WorkspaceInvitation.MAX_HASH_LENGTH + 1);

        // when
        ThrowingCallable action = () -> WorkspaceInvitation.create(
                1L,
                tooLongLinkTokenHash,
                INVITE_CODE_HASH,
                CREATED_AT
        );

        // then
        assertThatThrownBy(action).isInstanceOf(WorkspaceException.class)
                .extracting(exception -> ((WorkspaceException) exception).getErrorCode())
                .isEqualTo(WorkspaceErrorCode.INVALID_WORKSPACE_INVITATION_LINK_TOKEN_HASH);
    }

    @DisplayName("초대 코드 해시가 비어 있으면 초대 생성을 거부한다")
    @Test
    void create_failure_blankInviteCodeHash() {
        // given
        String blankInviteCodeHash = " ";

        // when
        ThrowingCallable action = () -> WorkspaceInvitation.create(
                1L,
                LINK_TOKEN_HASH,
                blankInviteCodeHash,
                CREATED_AT
        );

        // then
        assertThatThrownBy(action).isInstanceOf(WorkspaceException.class)
                .extracting(exception -> ((WorkspaceException) exception).getErrorCode())
                .isEqualTo(WorkspaceErrorCode.INVALID_WORKSPACE_INVITATION_CODE_HASH);
    }

    @DisplayName("초대 코드 해시가 저장 길이를 넘으면 초대 생성을 거부한다")
    @Test
    void create_failure_tooLongInviteCodeHash() {
        // given
        String tooLongInviteCodeHash = "a".repeat(WorkspaceInvitation.MAX_HASH_LENGTH + 1);

        // when
        ThrowingCallable action = () -> WorkspaceInvitation.create(
                1L,
                LINK_TOKEN_HASH,
                tooLongInviteCodeHash,
                CREATED_AT
        );

        // then
        assertThatThrownBy(action).isInstanceOf(WorkspaceException.class)
                .extracting(exception -> ((WorkspaceException) exception).getErrorCode())
                .isEqualTo(WorkspaceErrorCode.INVALID_WORKSPACE_INVITATION_CODE_HASH);
    }

    @DisplayName("생성 시각이 없으면 초대 생성을 거부한다")
    @Test
    void create_failure_missingCreatedAt() {
        // given
        Instant missingCreatedAt = null;

        // when
        ThrowingCallable action = () -> WorkspaceInvitation.create(
                1L,
                LINK_TOKEN_HASH,
                INVITE_CODE_HASH,
                missingCreatedAt
        );

        // then
        assertThatThrownBy(action).isInstanceOf(WorkspaceException.class)
                .extracting(exception -> ((WorkspaceException) exception).getErrorCode())
                .isEqualTo(WorkspaceErrorCode.INVALID_WORKSPACE_INVITATION_CREATED_AT);
    }

    @DisplayName("생성 이후 만료 전 시점에는 초대를 사용할 수 있다")
    @Test
    void validateUsableAt_success_beforeExpiration() {
        // given
        WorkspaceInvitation invitation = createInvitation();
        Instant pointInTime = CREATED_AT.plusSeconds(1);

        // when
        ThrowingCallable action = () -> invitation.validateUsableAt(pointInTime);

        // then
        assertThatCode(action).doesNotThrowAnyException();
    }

    @DisplayName("생성 전 시점에는 원인을 구분하지 않는 초대 없음으로 거부한다")
    @Test
    void validateUsableAt_failure_beforeCreation() {
        // given
        WorkspaceInvitation invitation = createInvitation();
        Instant pointInTime = CREATED_AT.minusNanos(1);

        // when
        ThrowingCallable action = () -> invitation.validateUsableAt(pointInTime);

        // then
        assertInvitationNotFound(action);
    }

    @DisplayName("만료 시각부터 원인을 구분하지 않는 초대 없음으로 거부한다")
    @Test
    void validateUsableAt_failure_atExpiration() {
        // given
        WorkspaceInvitation invitation = createInvitation();

        // when
        ThrowingCallable action = () -> invitation.validateUsableAt(invitation.getExpiresAt());

        // then
        assertInvitationNotFound(action);
    }

    @DisplayName("과거에 무효화된 초대는 조회 시점과 무관하게 초대 없음으로 거부한다")
    @Test
    void validateUsableAt_failure_invalidated() {
        // given
        WorkspaceInvitation invitation = createInvitation();
        setInvalidatedAt(
                invitation,
                CREATED_AT.plusSeconds(1)
        );

        // when
        ThrowingCallable action = () -> invitation.validateUsableAt(CREATED_AT.plusSeconds(2));

        // then
        assertInvitationNotFound(action);
    }

    @DisplayName("확인 시각이 없으면 초대 사용 가능 여부를 판단할 수 없다")
    @Test
    void validateUsableAt_failure_missingPointInTime() {
        // given
        WorkspaceInvitation invitation = createInvitation();
        Instant missingPointInTime = null;

        // when
        ThrowingCallable action = () -> invitation.validateUsableAt(missingPointInTime);

        // then
        assertThatThrownBy(action).isInstanceOf(WorkspaceException.class)
                .extracting(exception -> ((WorkspaceException) exception).getErrorCode())
                .isEqualTo(WorkspaceErrorCode.INVALID_WORKSPACE_INVITATION_POINT_IN_TIME);
    }

    @DisplayName("사용할 수 있는 초대로 참여하면 초대한 워크스페이스의 MEMBER 멤버십을 만든다")
    @Test
    void admit_success() {
        // given
        WorkspaceInvitation invitation = createInvitation();
        Instant joinedAt = CREATED_AT.plusSeconds(1);

        // when
        WorkspaceMember member = invitation.admit(
                2L,
                joinedAt
        );

        // then
        assertThat(member.getWorkspaceId()).isEqualTo(1L);
        assertThat(member.getMemberId()).isEqualTo(2L);
        assertThat(member.getRole()).isEqualTo(WorkspaceMemberRole.MEMBER);
        assertThat(member.getJoinedAt()).isEqualTo(joinedAt);
        assertThat(member.isActive()).isTrue();
    }

    @DisplayName("만료된 초대로는 멤버십을 만들지 않는다")
    @Test
    void admit_failure_expiredInvitation() {
        // given
        WorkspaceInvitation invitation = createInvitation();

        // when
        ThrowingCallable action = () -> invitation.admit(
                2L,
                invitation.getExpiresAt()
        );

        // then
        assertInvitationNotFound(action);
    }

    private WorkspaceInvitation createInvitation() {
        return WorkspaceInvitation.create(
                1L,
                LINK_TOKEN_HASH,
                INVITE_CODE_HASH,
                CREATED_AT
        );
    }

    private void setInvalidatedAt(
            WorkspaceInvitation invitation,
            Instant invalidatedAt
    ) {
        try {
            Field field = WorkspaceInvitation.class.getDeclaredField("invalidatedAt");
            field.setAccessible(true);
            field.set(
                    invitation,
                    invalidatedAt
            );
        } catch (NoSuchFieldException | IllegalAccessException exception) {
            throw new IllegalStateException(
                    "과거 무효화 행 fixture를 만들 수 없습니다",
                    exception
            );
        }
    }

    private void assertInvitationNotFound(ThrowingCallable action) {
        assertThatThrownBy(action).isInstanceOf(WorkspaceException.class)
                .extracting(exception -> ((WorkspaceException) exception).getErrorCode())
                .isEqualTo(WorkspaceErrorCode.WORKSPACE_INVITATION_PREVIEW_NOT_FOUND);
    }
}
