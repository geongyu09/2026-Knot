package com.knot.backend.global.exception;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import com.knot.backend.document.domain.DocumentConfirmationCursor;
import com.knot.backend.document.domain.DocumentCursor;
import com.knot.backend.document.domain.DocumentGenerationJobCursor;
import com.knot.backend.search.domain.SearchConversationCursor;
import com.knot.backend.testsupport.LogCapture;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class InputExceptionCauseTest {

    @ParameterizedTest
    @ValueSource(ints = {0, 1, 2, 3})
    @DisplayName("커서의 실제 파싱 원인을 보존해도 기존 400을 유지하고 ERROR를 만들지 않는다")
    void parse_failure_preservesInputCauseWithoutErrorLog(int index) {
        Throwable thrown = catchThrowable(parser(index)::run);
        assertThat(thrown).isInstanceOf(ProjectException.class)
                .hasCauseInstanceOf(IllegalArgumentException.class);
        try (LogCapture logs = new LogCapture(GlobalExceptionHandler.class)) {
            assertThat(
                    new GlobalExceptionHandler().handleProjectException(ProjectException.class.cast(thrown))
                            .getStatusCode()
                            .value()
            ).isEqualTo(400);
            assertThat(logs.events()).isEmpty();
        }
    }

    private Runnable parser(int index) {
        return switch (index) {
            case 0 -> () -> DocumentConfirmationCursor.parse(
                    "!!",
                    1,
                    2,
                    3
            );
            case 1 -> () -> DocumentCursor.parse(
                    "!!",
                    1,
                    2,
                    null,
                    null
            );
            case 2 -> () -> DocumentGenerationJobCursor.parse(
                    "!!",
                    1,
                    2
            );
            case 3 -> () -> SearchConversationCursor.parse(
                    "!!",
                    1,
                    2
            );
            default -> throw new AssertionError("지원하지 않는 테스트 입력");
        };
    }
}
