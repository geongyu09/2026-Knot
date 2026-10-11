package com.knot.backend.global.config;

import com.knot.backend.search.application.SearchAnswerGenerator;
import com.knot.backend.search.application.SearchDocumentRetriever;
import com.knot.backend.search.application.SearchToolAccess;
import com.knot.backend.search.infrastructure.SearchAgentHttp;
import com.knot.backend.search.infrastructure.SearchTransportCancellation;
import com.knot.backend.search.infrastructure.SearchHistoryQuery;
import com.knot.backend.search.infrastructure.SearchLlmClient;
import com.knot.backend.search.infrastructure.SearchMcpDocumentRetriever;
import com.knot.backend.search.infrastructure.SearchStreamingAnswerGenerator;
import com.knot.backend.search.infrastructure.mcp.SearchMcpClient;
import com.knot.backend.search.infrastructure.mcp.SearchToolTokenCodec;
import java.net.http.HttpClient;
import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.ObjectMapper;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = {"knot.search.agent.enabled", "knot.llm.enabled"}, havingValue = "true")
public class SearchAgentConfig {

    @Bean(destroyMethod = "close")
    public SearchTransportCancellation searchTransportCancellation(
            SearchToolAccess access,
            SearchAgentProperties properties
    ) {
        return new SearchTransportCancellation(
                access,
                properties.getCancellationPollInterval()
        );
    }

    @Bean(destroyMethod = "close")
    public SearchAgentHttp searchAgentHttp(
            LlmProperties llm,
            SearchAgentProperties agent,
            SearchWorkerProperties worker,
            ObjectMapper mapper,
            Clock clock,
            SearchTransportCancellation cancellations
    ) {
        agent.validate();
        llm.validateEnabledConfiguration();
        if (agent.getBudget()
                .compareTo(worker.getExecutionLease()) >= 0) {
            throw new IllegalStateException("search agent budget must be shorter than execution lease");
        }
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(llm.getConnectTimeout())
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
        return new SearchAgentHttp(
                client,
                mapper,
                clock,
                llm.getMaxResponseBytes(),
                cancellations
        );
    }

    @Bean
    public SearchLlmClient searchLlmClient(
            SearchAgentHttp http,
            LlmProperties llm
    ) {
        return new SearchLlmClient(
                http,
                llm
        );
    }

    @Bean
    public SearchMcpClient searchMcpClient(
            SearchAgentHttp http,
            SearchToolTokenCodec tokens,
            SearchAgentProperties properties,
            ObjectMapper mapper
    ) {
        return new SearchMcpClient(
                http,
                tokens,
                properties,
                mapper
        );
    }

    @Bean
    public SearchDocumentRetriever searchDocumentRetriever(
            SearchLlmClient llm,
            SearchMcpClient mcp,
            SearchHistoryQuery history,
            SearchToolAccess access,
            SearchAgentProperties properties,
            ObjectMapper mapper
    ) {
        return new SearchMcpDocumentRetriever(
                llm,
                mcp,
                history,
                access,
                properties,
                mapper
        );
    }

    @Bean
    public SearchAnswerGenerator searchAnswerGenerator(
            SearchLlmClient llm,
            SearchHistoryQuery history,
            SearchToolAccess access,
            SearchAgentProperties properties,
            ObjectMapper mapper
    ) {
        return new SearchStreamingAnswerGenerator(
                llm,
                history,
                access,
                properties,
                mapper
        );
    }
}
