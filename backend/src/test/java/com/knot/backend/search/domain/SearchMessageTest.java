package com.knot.backend.search.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.time.Instant;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

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
        assertThatExceptionOfType(SearchException.class).isThrownBy(() -> answer.appendContent("늦은 출력"));
        assertThatExceptionOfType(SearchException.class).isThrownBy(answer::complete);
        assertThatExceptionOfType(SearchException.class).isThrownBy(() -> answer.fail("FAILURE"));
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
        assertThatExceptionOfType(SearchException.class).isThrownBy(question::stop);
        assertThatExceptionOfType(SearchException.class).isThrownBy(completed::stop);
        assertThatExceptionOfType(SearchException.class).isThrownBy(failed::stop);
    }

    @Test
    @DisplayName("질문은 원문을 보존한 RECEIVED USER 메시지로 만들어진다")
    void receiveQuestion_success_preservesContent() {
        SearchMessage question = SearchMessage.receiveQuestion(
                1,
                1,
                " 질문 ",
                TIME
        );
        assertThat(question.getRole()).isEqualTo(SearchMessageRole.USER);
        assertThat(question.getStatus()).isEqualTo(SearchMessageStatus.RECEIVED);
        assertThat(question.getContent()).isEqualTo(" 질문 ");
    }

    @Test
    @DisplayName("답변은 빈 STREAMING ASSISTANT 메시지로 만들어진다")
    void startAnswer_success_emptyStreaming() {
        SearchMessage answer = answer();
        assertThat(answer.getRole()).isEqualTo(SearchMessageRole.ASSISTANT);
        assertThat(answer.getSequence()).isEqualTo(2);
        assertThat(answer.getContent()).isEmpty();
        assertThat(answer.getStatus()).isEqualTo(SearchMessageStatus.STREAMING);
    }

    @Test
    @DisplayName("실패한 답변은 부분 본문과 안전한 실패 코드를 보존한다")
    void fail_success_preservesPartialContent() {
        SearchMessage answer = answer();
        answer.appendContent("한글 😀");
        answer.fail("ANSWER_GENERATION_FAILED");
        assertThat(answer.getContent()).isEqualTo("한글 😀");
        assertThat(answer.getStatus()).isEqualTo(SearchMessageStatus.FAILED);
        assertThat(answer.getFailureCode()).isEqualTo("ANSWER_GENERATION_FAILED");
    }

    @Test
    @DisplayName("실패한 답변에는 늦은 본문을 추가할 수 없다")
    void appendContent_failure_failedAnswer() {
        SearchMessage answer = failedAnswer();
        assertThatExceptionOfType(SearchException.class).isThrownBy(() -> answer.appendContent("늦은 본문"));
    }

    @Test
    @DisplayName("실패한 답변을 정상 완료로 덮어쓸 수 없다")
    void complete_failure_failedAnswer() {
        SearchMessage answer = failedAnswer();
        assertThatExceptionOfType(SearchException.class).isThrownBy(answer::complete);
    }

    @Test
    @DisplayName("본문이 있는 답변은 COMPLETED로 완료된다")
    void complete_success_completed() {
        SearchMessage answer = answer();
        answer.appendContent("답변");
        answer.complete();
        assertThat(answer.getStatus()).isEqualTo(SearchMessageStatus.COMPLETED);
        assertThat(answer.getFailureCode()).isNull();
    }

    @Test
    @DisplayName("완료된 답변을 실패 상태로 덮어쓸 수 없다")
    void fail_failure_completedAnswer() {
        SearchMessage answer = answer();
        answer.appendContent("답변");
        answer.complete();
        assertThatExceptionOfType(SearchException.class).isThrownBy(() -> answer.fail("ANSWER_GENERATION_FAILED"));
    }

    @Test
    @DisplayName("USER 질문에는 답변 본문을 추가할 수 없다")
    void appendContent_failure_userQuestion() {
        SearchMessage question = SearchMessage.receiveQuestion(
                1,
                1,
                "질문",
                TIME
        );
        assertThatExceptionOfType(SearchException.class).isThrownBy(() -> question.appendContent("추가"));
    }

    @Test
    @DisplayName("본문 없는 완료는 커스텀 오류로 거절하고 STREAMING을 유지한다")
    void complete_failure_emptyAnswer() {
        SearchMessage answer = answer();
        assertThatExceptionOfType(SearchException.class).isThrownBy(answer::complete);
        assertThat(answer.getStatus()).isEqualTo(SearchMessageStatus.STREAMING);
    }

    @ParameterizedTest
    @MethodSource("invalidIdentity")
    @DisplayName("메시지 소속과 순서 및 시각은 유효해야 한다")
    void startAnswer_failure_invalidIdentityAndTime(
            long conversationId,
            int sequence,
            Instant createdAt
    ) {
        assertThatExceptionOfType(SearchException.class).isThrownBy(
                () -> SearchMessage.startAnswer(
                        conversationId,
                        sequence,
                        createdAt
                )
        );
    }

    @Test
    @DisplayName("공백 질문은 검증 오류로 거절한다")
    void receiveQuestion_failure_blankQuestion() {
        assertThatExceptionOfType(SearchException.class).isThrownBy(
                () -> SearchMessage.receiveQuestion(
                        1,
                        1,
                        " ",
                        TIME
                )
        )
                .satisfies(
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(SearchErrorCode.VALIDATION_ERROR)
                );
    }

    private static Stream<Arguments> invalidIdentity() {
        return Stream.of(
                Arguments.of(
                        0L,
                        2,
                        TIME
                ),
                Arguments.of(
                        1L,
                        0,
                        TIME
                ),
                Arguments.of(
                        1L,
                        2,
                        null
                )
        );
    }

    private SearchMessage answer() {
        return SearchMessage.startAnswer(
                1,
                2,
                TIME
        );
    }

    private SearchMessage failedAnswer() {
        SearchMessage answer = answer();
        answer.fail("ANSWER_GENERATION_FAILED");
        return answer;
    }
}
