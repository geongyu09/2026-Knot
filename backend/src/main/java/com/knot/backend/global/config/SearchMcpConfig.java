package com.knot.backend.global.config;

import com.knot.backend.search.application.SearchDocumentToolService;
import com.knot.backend.search.application.SearchToolAccess;
import com.knot.backend.search.application.SearchToolScope;
import com.knot.backend.search.infrastructure.persistence.SearchDocumentQueryAdapter;
import com.knot.backend.search.infrastructure.mcp.SearchMcpAuthenticationFilter;
import com.knot.backend.search.infrastructure.mcp.SearchMcpTools;
import com.knot.backend.search.infrastructure.mcp.SearchToolTokenCodec;
import io.modelcontextprotocol.common.McpTransportContext;
import io.modelcontextprotocol.json.McpJsonDefaults;
import io.modelcontextprotocol.server.McpServer;
import io.modelcontextprotocol.server.McpStatelessSyncServer;
import java.time.Clock;
import java.util.Map;
import org.springframework.ai.mcp.server.webmvc.transport.WebMvcStatelessServerTransport;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.servlet.function.RouterFunction;
import org.springframework.web.servlet.function.ServerResponse;
import tools.jackson.databind.ObjectMapper;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(SearchAgentProperties.class)
@ConditionalOnProperty(name = "knot.search.agent.enabled", havingValue = "true")
public class SearchMcpConfig {

    @Bean
    public SearchToolTokenCodec searchToolTokenCodec(
            ObjectMapper mapper,
            SearchAgentProperties properties,
            Clock clock
    ) {
        properties.validate();
        return new SearchToolTokenCodec(
                mapper,
                properties,
                clock
        );
    }

    @Bean
    public SearchDocumentToolService searchDocumentToolService(
            SearchDocumentQueryAdapter query,
            SearchToolAccess access,
            SearchToolTokenCodec tokens,
            SearchAgentProperties properties
    ) {
        return new SearchDocumentToolService(
                query,
                access,
                tokens,
                properties
        );
    }

    @Bean
    public SearchMcpTools searchMcpTools(
            SearchDocumentToolService service,
            ObjectMapper mapper
    ) {
        return new SearchMcpTools(
                service,
                mapper
        );
    }

    @Bean
    @Order(1)
    public SecurityFilterChain searchMcpSecurity(
            HttpSecurity http,
            SearchToolTokenCodec tokens,
            SearchToolAccess access
    ) throws Exception {
        http.securityMatcher("/internal/mcp")
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(
                        auth -> auth.anyRequest()
                                .permitAll()
                )
                .addFilterBefore(
                        new SearchMcpAuthenticationFilter(
                                tokens,
                                access
                        ),
                        UsernamePasswordAuthenticationFilter.class
                );
        return http.build();
    }

    @Bean
    public WebMvcStatelessServerTransport searchMcpTransport() {
        return WebMvcStatelessServerTransport.builder()
                .jsonMapper(McpJsonDefaults.getMapper())
                .messageEndpoint("/internal/mcp")
                .contextExtractor(
                        request -> McpTransportContext.create(
                                Map.of(
                                        "scope",
                                        request.servletRequest()
                                                .getAttribute(SearchMcpAuthenticationFilter.SCOPE_ATTRIBUTE)
                                )
                        )
                )
                .build();
    }

    @Bean
    public McpStatelessSyncServer searchMcpServer(
            WebMvcStatelessServerTransport transport,
            SearchMcpTools tools
    ) {
        McpServer.StatelessSyncSpecification server = McpServer.sync(transport)
                .serverInfo(
                        "knot-search",
                        "1.0.0"
                );
        for (io.modelcontextprotocol.spec.McpSchema.Tool tool : tools.definitions()) {
            server.toolCall(
                    tool,
                    (
                            context,
                            request
                    ) -> tools.call(
                            (SearchToolScope) context.get("scope"),
                            request
                    )
            );
        }
        return server.build();
    }

    @Bean
    public RouterFunction<ServerResponse> searchMcpRoutes(
            WebMvcStatelessServerTransport transport,
            McpStatelessSyncServer server
    ) {
        return transport.getRouterFunction();
    }
}
