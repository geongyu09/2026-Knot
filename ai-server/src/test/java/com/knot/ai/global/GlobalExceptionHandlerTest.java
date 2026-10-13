package com.knot.ai.global;

import static org.assertj.core.api.Assertions.assertThat;

import com.knot.ai.global.exception.ErrorCategory;
import com.knot.ai.global.exception.ErrorCode;
import com.knot.ai.global.exception.ProjectException;
import com.knot.ai.global.response.ErrorResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.ResponseEntity;

class GlobalExceptionHandlerTest {
    @ParameterizedTest
    @CsvSource({"INVALID_INPUT,400", "UNAUTHORIZED,401", "FORBIDDEN,403", "NOT_FOUND,404", "CONFLICT,409",
            "TOO_MANY_REQUESTS,429", "INTERNAL_SERVER_ERROR,500", "BAD_GATEWAY,502", "SERVICE_UNAVAILABLE,503",
            "GATEWAY_TIMEOUT,504"})
    @DisplayName("프로젝트 예외 범주를 HTTP 상태로 매핑하고 오류 계약을 보존한다")
    void handleProject_success_categoryMapping(
            ErrorCategory category,
            int status
    ) {
        // given
        ErrorCode code = new ErrorCode() {
            @Override
            public ErrorCategory getCategory() {
                return category;
            }

            @Override
            public String getCode() {
                return "TEST_ERROR";
            }

            @Override
            public String getMessage() {
                return "테스트 오류입니다";
            }
        };
        ProjectException exception = new ProjectException(code) {
        };

        // when
        ResponseEntity<ErrorResponse> response = new GlobalExceptionHandler().handleProject(exception);

        // then
        assertThat(
                response.getStatusCode()
                        .value()
        ).isEqualTo(status);
        assertThat(
                response.getBody()
                        .code()
        ).isEqualTo("TEST_ERROR");
        assertThat(
                response.getBody()
                        .message()
        ).isEqualTo("테스트 오류입니다");
        assertThat(
                response.getBody()
                        .fieldErrors()
        ).isEmpty();
    }
}
