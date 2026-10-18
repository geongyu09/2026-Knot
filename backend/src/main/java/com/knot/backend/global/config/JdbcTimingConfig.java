package com.knot.backend.global.config;

import com.knot.backend.global.logging.JdbcTimingDataSourcePostProcessor;
import com.knot.backend.global.logging.RequestJdbcTimingFilter;
import jakarta.servlet.DispatcherType;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.Ordered;

@Configuration(proxyBeanMethods = false)
@Profile("dev & !prod")
@ConditionalOnProperty(name = "knot.observability.jdbc.enabled", havingValue = "true")
public class JdbcTimingConfig {

    @Bean
    public static JdbcTimingDataSourcePostProcessor jdbcTimingDataSourcePostProcessor() {
        return new JdbcTimingDataSourcePostProcessor();
    }

    @Bean
    public FilterRegistrationBean<RequestJdbcTimingFilter> requestJdbcTimingFilterRegistration(
            @Value("${knot.observability.jdbc.slow-request-ms:500}") long slowRequestMs
    ) {
        FilterRegistrationBean<RequestJdbcTimingFilter> registration = new FilterRegistrationBean<>(
                new RequestJdbcTimingFilter(
                        Math.max(
                                0,
                                slowRequestMs
                        ),
                        System::nanoTime
                )
        );
        registration.setName("requestJdbcTimingFilter");
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 1);
        registration.setAsyncSupported(true);
        registration.setDispatcherTypes(DispatcherType.REQUEST);
        return registration;
    }
}
