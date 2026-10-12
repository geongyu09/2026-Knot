package com.knot.backend.search.infrastructure.mcp;

import com.knot.backend.global.logging.ServerErrorLogger;
import com.knot.backend.search.application.SearchToolAccess;
import com.knot.backend.search.application.SearchToolScope;
import com.knot.backend.search.domain.SearchToolException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import lombok.RequiredArgsConstructor;
import org.springframework.web.filter.OncePerRequestFilter;

@RequiredArgsConstructor
@lombok.extern.slf4j.Slf4j
public class SearchMcpAuthenticationFilter extends OncePerRequestFilter {
    public static final String SCOPE_ATTRIBUTE = "knot.search.mcp.scope";

    private final SearchToolTokenCodec tokens;
    private final SearchToolAccess access;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain chain
    ) throws ServletException, IOException {
        SearchToolScope scope;
        try {
            scope = authenticate(request.getHeader("Authorization"));
        } catch (SearchToolException exception) {
            logInternalFailure(exception);
            response.sendError(401);
            return;
        } catch (RuntimeException exception) {
            ServerErrorLogger.record(
                    log,
                    "MCP authentication phase=validate",
                    exception
            );
            throw exception;
        }
        try {
            access.validate(scope);
        } catch (SearchToolException exception) {
            logInternalFailure(exception);
            response.sendError(403);
            return;
        } catch (RuntimeException exception) {
            ServerErrorLogger.record(
                    log,
                    "MCP authentication phase=validate",
                    exception
            );
            throw exception;
        }
        request.setAttribute(
                SCOPE_ATTRIBUTE,
                scope
        );
        chain.doFilter(
                request,
                response
        );
    }

    private void logInternalFailure(SearchToolException exception) {
        if (ServerErrorLogger.isInternalFailure(exception)) {
            ServerErrorLogger.record(
                    log,
                    "MCP authentication phase=validate",
                    exception
            );
        }
    }

    private SearchToolScope authenticate(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw new SearchToolException("SEARCH_ACCESS_DENIED");
        }
        return tokens.authenticate(authorization.substring(7));
    }
}
