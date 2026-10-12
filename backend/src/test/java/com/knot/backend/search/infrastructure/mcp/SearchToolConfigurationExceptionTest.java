package com.knot.backend.search.infrastructure.mcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import com.knot.backend.global.config.SearchAgentProperties;
import com.knot.backend.search.domain.SearchException;
import com.knot.backend.search.domain.SearchErrorCode;
import java.time.Clock;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class SearchToolConfigurationExceptionTest {

    @Test
    void encode_failure_missingKeyUsesCustomConfigurationError() {
        SearchToolTokenCodec codec = new SearchToolTokenCodec(
                new ObjectMapper(),
                new SearchAgentProperties(),
                Clock.systemUTC()
        );
        assertThatExceptionOfType(SearchException.class).isThrownBy(
                () -> codec.encode(
                        "test",
                        "value"
                )
        )
                .satisfies(
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(SearchErrorCode.INVALID_SEARCH_CONFIGURATION)
                );
    }

    @Test
    void validate_failure_invalidToolLimitUsesCustomConfigurationError() {
        SearchAgentProperties properties = new SearchAgentProperties();
        properties.setSigningKey("test-signing-key-32-characters-minimum");
        properties.setToolCallLimit(0);
        assertThatExceptionOfType(SearchException.class).isThrownBy(properties::validate)
                .satisfies(
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(SearchErrorCode.INVALID_SEARCH_CONFIGURATION)
                );
    }
}
