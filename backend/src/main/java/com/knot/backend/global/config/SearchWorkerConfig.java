package com.knot.backend.global.config;

import com.knot.backend.search.application.SearchGenerationAvailability;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import java.util.concurrent.ThreadPoolExecutor;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(SearchWorkerProperties.class)
public class SearchWorkerConfig {

    @Bean
    @ConditionalOnProperty(prefix = "knot.search.worker", name = "enabled", havingValue = "true")
    public ThreadPoolTaskExecutor searchGenerationExecutor(
            SearchWorkerProperties properties,
            SearchGenerationAvailability availability
    ) {
        properties.validate();
        availability.requireAvailable();
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(properties.getConcurrency());
        executor.setMaxPoolSize(properties.getConcurrency());
        executor.setQueueCapacity(0);
        executor.setThreadNamePrefix("search-generation-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(false);
        return executor;
    }

    @Bean
    public ThreadPoolTaskExecutor searchStreamExecutor(SearchWorkerProperties properties) {
        properties.validate();
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(properties.getStreamConcurrency());
        executor.setMaxPoolSize(properties.getStreamConcurrency());
        executor.setQueueCapacity(0);
        executor.setThreadNamePrefix("search-stream-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(false);
        return executor;
    }

}
