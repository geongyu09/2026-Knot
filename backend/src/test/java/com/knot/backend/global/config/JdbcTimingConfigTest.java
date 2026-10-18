package com.knot.backend.global.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.knot.backend.global.logging.JdbcTimingDataSourcePostProcessor;
import javax.sql.DataSource;
import net.ttddyy.dsproxy.support.ProxyDataSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class JdbcTimingConfigTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(JdbcTimingConfig.class)
            .withBean(
                    "dataSource",
                    DataSource.class,
                    () -> mock(DataSource.class)
            )
            .withPropertyValues("knot.observability.jdbc.enabled=true");

    @Test
    @DisplayName("Dev 활성화에서만 DataSource를 계측 프록시로 감싼다")
    void configuration_success_devEnabled() {
        runner.withInitializer(
                context -> context.getEnvironment()
                        .setActiveProfiles("dev")
        )
                .run(context -> {
                    assertThat(context).hasSingleBean(JdbcTimingDataSourcePostProcessor.class);
                    assertThat(context.getBean(DataSource.class)).isInstanceOf(ProxyDataSource.class);
                });
    }

    @Test
    @DisplayName("Prod 단독이나 Dev Prod 동시 활성화에서는 계측하지 않는다")
    void configuration_success_excludesProduction() {
        runner.withInitializer(
                context -> context.getEnvironment()
                        .setActiveProfiles("prod")
        )
                .run(context -> assertThat(context).doesNotHaveBean(JdbcTimingDataSourcePostProcessor.class));
        runner.withInitializer(
                context -> context.getEnvironment()
                        .setActiveProfiles(
                                "dev",
                                "prod"
                        )
        )
                .run(context -> assertThat(context).doesNotHaveBean(JdbcTimingDataSourcePostProcessor.class));
    }

    @Test
    @DisplayName("Dev에서도 명시적으로 끄면 원본 DataSource를 유지한다")
    void configuration_success_disabled() {
        runner.withInitializer(
                context -> context.getEnvironment()
                        .setActiveProfiles("dev")
        )
                .withPropertyValues("knot.observability.jdbc.enabled=false")
                .run(context -> {
                    assertThat(context).doesNotHaveBean(JdbcTimingDataSourcePostProcessor.class);
                    assertThat(context.getBean(DataSource.class)).isNotInstanceOf(ProxyDataSource.class);
                });
    }
}
