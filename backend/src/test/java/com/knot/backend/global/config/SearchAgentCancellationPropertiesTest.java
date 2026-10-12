package com.knot.backend.global.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.knot.backend.search.domain.SearchErrorCode;
import com.knot.backend.search.domain.SearchException;
import java.time.Duration;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

class SearchAgentCancellationPropertiesTest {

    @Test
    @DisplayName("기본 취소 감시 주기는 250ms이며 양수 설정을 검증한다")
    void validate_success_defaultInterval() {
        SearchAgentProperties properties = properties();
        properties.validate();
        assertThat(properties.getCancellationPollInterval()).isEqualTo(Duration.ofMillis(250));
    }

    @ParameterizedTest
    @MethodSource("invalidIntervals")
    @DisplayName("NULL·0·1ms 미만 감시 주기는 설정 오류다")
    void validate_failure_invalidInterval(Duration interval) {
        SearchAgentProperties properties = properties();
        properties.setCancellationPollInterval(interval);

        assertThatThrownBy(properties::validate).isInstanceOfSatisfying(
                SearchException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(SearchErrorCode.INVALID_SEARCH_CONFIGURATION)
        );
    }

    private static Stream<Duration> invalidIntervals() {
        return Stream.of(
                null,
                Duration.ZERO,
                Duration.ofNanos(1)
        );
    }

    private SearchAgentProperties properties() {
        SearchAgentProperties properties = new SearchAgentProperties();
        properties.setSigningKey("test-key-with-at-least-32-characters");
        return properties;
    }
}
