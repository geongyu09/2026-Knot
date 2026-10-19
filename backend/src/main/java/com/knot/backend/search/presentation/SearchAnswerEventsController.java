package com.knot.backend.search.presentation;

import com.knot.backend.auth.domain.model.AuthenticatedMember;
import com.knot.backend.search.presentation.stream.SearchAnswerStream;
import java.nio.charset.StandardCharsets;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/workspaces/{workspaceId}/search/conversations/{conversationId}/answers")
public class SearchAnswerEventsController implements SearchAnswerEventsApi {

    private final SearchAnswerStream streams;

    @Override
    @GetMapping(value = "/{answerId}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<SseEmitter> reconnect(
            @PathVariable Long workspaceId,
            @PathVariable Long conversationId,
            @PathVariable Long answerId,
            @AuthenticationPrincipal AuthenticatedMember member
    ) {
        SseEmitter emitter = streams.reconnect(
                workspaceId,
                member.getMemberId(),
                conversationId,
                answerId
        );
        return ResponseEntity.ok()
                .contentType(
                        new MediaType(
                                "text",
                                "event-stream",
                                StandardCharsets.UTF_8
                        )
                )
                .header(
                        "Cache-Control",
                        "no-cache"
                )
                .header(
                        "X-Accel-Buffering",
                        "no"
                )
                .body(emitter);
    }
}
