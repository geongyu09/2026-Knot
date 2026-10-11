package com.knot.backend.global.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SearchAgentCancellationPropertiesTest {

    @Test
    @DisplayName("기본 취소 감시 주기는 250ms이며 양수 설정을 검증한다")
    void validate_success_defaultInterval() {
        SearchAgentProperties properties = properties();
        properties.validate();
        assertThat(properties.getCancellationPollInterval()).isEqualTo(Duration.ofMillis(250));
    }

    @Test
    @DisplayName("NULL·0·1ms 미만 감시 주기는 설정 오류다")
    void validate_failure_invalidInterval() {
        SearchAgentProperties properties = properties();
        properties.setCancellationPollInterval(null);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalStateException.class);
        properties.setCancellationPollInterval(Duration.ZERO);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalStateException.class);
        properties.setCancellationPollInterval(Duration.ofNanos(1));
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalStateException.class);
    }

    private SearchAgentProperties properties() {
        SearchAgentProperties properties = new SearchAgentProperties();
        properties.setSigningKey("test-key-with-at-least-32-characters");
        return properties;
    }
}
