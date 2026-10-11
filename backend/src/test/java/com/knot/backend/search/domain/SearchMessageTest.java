package com.knot.backend.search.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SearchMessageTest {
    private static final Instant TIME = Instant.parse("2026-10-11T00:00:00Z");

    @Test
    @DisplayName("중지는 부분 본문을 그대로 보존하고 늦은 출력을 거절한다")
    void stop_success_preservesContent() {
        SearchMessage answer = SearchMessage.startAnswer(
                1,
                2,
                TIME
        );
        answer.appendContent("부분 😀\n본문");

        answer.stop();

        assertThat(answer.getStatus()).isEqualTo(SearchMessageStatus.STOPPED);
        assertThat(answer.getContent()).isEqualTo("부분 😀\n본문");
        assertThat(answer.getFailureCode()).isNull();
        assertThatIllegalStateException().isThrownBy(() -> answer.appendContent("늦은 출력"));
        assertThatIllegalStateException().isThrownBy(answer::complete);
        assertThatIllegalStateException().isThrownBy(() -> answer.fail("FAILURE"));
    }

    @Test
    @DisplayName("출력 전 중지는 빈 본문을 보존한다")
    void stop_success_emptyContent() {
        SearchMessage answer = SearchMessage.startAnswer(
                1,
                2,
                TIME
        );
        answer.stop();
        assertThat(answer.getContent()).isEmpty();
        assertThat(answer.getStatus()).isEqualTo(SearchMessageStatus.STOPPED);
    }

    @Test
    @DisplayName("질문과 완료·실패 답변은 중지할 수 없다")
    void stop_failure_notStreamingAnswer() {
        SearchMessage question = SearchMessage.receiveQuestion(
                1,
                1,
                "질문",
                TIME
        );
        SearchMessage completed = SearchMessage.startAnswer(
                1,
                2,
                TIME
        );
        completed.appendContent("완료");
        completed.complete();
        SearchMessage failed = SearchMessage.startAnswer(
                1,
                4,
                TIME
        );
        failed.fail("FAILURE");
        assertThatIllegalStateException().isThrownBy(question::stop);
        assertThatIllegalStateException().isThrownBy(completed::stop);
        assertThatIllegalStateException().isThrownBy(failed::stop);
    }

    @Test
    @DisplayName("첫 질문과 답변은 RECEIVED와 빈 STREAMING 본문으로 만들어진다")
    void create_success_rolesAndSequence() {
        SearchMessage question = SearchMessage.receiveQuestion(
                1,
                1,
                " 질문 ",
                TIME
        );
        SearchMessage answer = SearchMessage.startAnswer(
                1,
                2,
                TIME
        );
        assertThat(question.getRole()).isEqualTo(SearchMessageRole.USER);
        assertThat(question.getStatus()).isEqualTo(SearchMessageStatus.RECEIVED);
        assertThat(question.getContent()).isEqualTo(" 질문 ");
        assertThat(answer.getRole()).isEqualTo(SearchMessageRole.ASSISTANT);
        assertThat(answer.getSequence()).isEqualTo(2);
        assertThat(answer.getContent()).isEmpty();
        assertThat(answer.getStatus()).isEqualTo(SearchMessageStatus.STREAMING);
    }

    @Test
    @DisplayName("부분 본문을 이어 붙인 뒤 실패하면 부분 본문과 안전한 실패 코드를 보존한다")
    void fail_success_preservesPartialContent() {
        SearchMessage answer = SearchMessage.startAnswer(
                1,
                2,
                TIME
        );
        answer.appendContent("한글 😀");
        answer.fail("ANSWER_GENERATION_FAILED");
        assertThat(answer.getContent()).isEqualTo("한글 😀");
        assertThat(answer.getStatus()).isEqualTo(SearchMessageStatus.FAILED);
        assertThat(answer.getFailureCode()).isEqualTo("ANSWER_GENERATION_FAILED");
        assertThatIllegalStateException().isThrownBy(() -> answer.appendContent("늦은 본문"));
        assertThatIllegalStateException().isThrownBy(answer::complete);
    }

    @Test
    @DisplayName("완료한 답변과 질문은 본문을 덮어쓸 수 없다")
    void complete_success_terminalIsImmutable() {
        SearchMessage answer = SearchMessage.startAnswer(
                1,
                2,
                TIME
        );
        answer.appendContent("답변");
        answer.complete();
        assertThat(answer.getStatus()).isEqualTo(SearchMessageStatus.COMPLETED);
        assertThat(answer.getFailureCode()).isNull();
        assertThatIllegalStateException().isThrownBy(() -> answer.fail("ANSWER_GENERATION_FAILED"));
        SearchMessage question = SearchMessage.receiveQuestion(
                1,
                1,
                "질문",
                TIME
        );
        assertThatIllegalStateException().isThrownBy(() -> question.appendContent("추가"));
    }

    @Test
    @DisplayName("본문이 없는 정상 완료는 거절하고 생성 중 상태를 유지한다")
    void complete_failure_emptyAnswer() {
        SearchMessage answer = SearchMessage.startAnswer(
                1,
                2,
                TIME
        );
        assertThatIllegalStateException().isThrownBy(answer::complete);
        assertThat(answer.getStatus()).isEqualTo(SearchMessageStatus.STREAMING);
    }

    @Test
    @DisplayName("메시지 소속과 순서 및 시각은 유효해야 한다")
    void create_failure_invalidIdentityAndTime() {
        assertThatIllegalArgumentException().isThrownBy(
                () -> SearchMessage.startAnswer(
                        0,
                        2,
                        TIME
                )
        );
        assertThatIllegalArgumentException().isThrownBy(
                () -> SearchMessage.startAnswer(
                        1,
                        0,
                        TIME
                )
        );
        assertThatIllegalArgumentException().isThrownBy(
                () -> SearchMessage.startAnswer(
                        1,
                        2,
                        null
                )
        );
        assertThatIllegalArgumentException().isThrownBy(
                () -> SearchMessage.receiveQuestion(
                        1,
                        1,
                        " ",
                        TIME
                )
        );
    }
}
