package com.knot.backend.search.presentation;

import com.knot.backend.auth.domain.AuthenticatedMember;
import com.knot.backend.search.application.SearchQuestionIntakeService;
import com.knot.backend.search.application.SearchAnswerRetryService;
import com.knot.backend.search.presentation.dto.request.SearchAnswerRetryRequest;
import java.util.UUID;
import com.knot.backend.search.application.dto.command.SearchQuestionCommand;
import com.knot.backend.search.application.dto.result.SearchQuestionAcceptedResult;
import com.knot.backend.search.presentation.stream.SearchAnswerStream;
import com.knot.backend.search.presentation.stream.SearchStreamReservation;
import com.knot.backend.search.presentation.dto.request.SearchQuestionRequest;
import java.nio.charset.StandardCharsets;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/workspaces/{workspaceId}/search/conversations")
public class SearchQuestionController implements SearchQuestionApi {

    private final SearchQuestionIntakeService intake;
    private final SearchAnswerRetryService retries;
    private final SearchAnswerStream streams;

    @Override
    @PostMapping(value = "/{conversationId}/questions/{questionId}/retry", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<SseEmitter> retry(
            @PathVariable Long workspaceId,
            @PathVariable Long conversationId,
            @PathVariable Long questionId,
            @RequestBody SearchAnswerRetryRequest request,
            @AuthenticationPrincipal AuthenticatedMember member
    ) {
        UUID requestId = request.toRequestId();
        SearchStreamReservation reservation = streams.reserve();
        try {
            SearchQuestionAcceptedResult accepted = retries.acceptRetry(
                    workspaceId,
                    member.getMemberId(),
                    conversationId,
                    questionId,
                    requestId
            );
            SseEmitter emitter = streams.openRetry(
                    workspaceId,
                    member.getMemberId(),
                    accepted,
                    reservation
            );
            return eventStream(emitter);
        } catch (RuntimeException exception) {
            reservation.close();
            throw exception;
        }
    }

    @Override
    @PostMapping(value = "/{conversationId}/questions", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<SseEmitter> ask(
            @PathVariable Long workspaceId,
            @PathVariable Long conversationId,
            @RequestBody SearchQuestionRequest request,
            @AuthenticationPrincipal AuthenticatedMember member
    ) {
        SearchQuestionCommand command = request.toCommand();
        SearchStreamReservation reservation = streams.reserve();
        try {
            SearchQuestionAcceptedResult accepted = intake.acceptNext(
                    workspaceId,
                    member.getMemberId(),
                    conversationId,
                    command
            );
            SseEmitter emitter = streams.open(
                    workspaceId,
                    member.getMemberId(),
                    accepted,
                    reservation
            );
            return eventStream(emitter);
        } catch (RuntimeException exception) {
            reservation.close();
            throw exception;
        }
    }

    @Override
    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<SseEmitter> create(
            @PathVariable Long workspaceId,
            @RequestBody SearchQuestionRequest request,
            @AuthenticationPrincipal AuthenticatedMember member
    ) {
        SearchQuestionCommand command = request.toCommand();
        SearchStreamReservation reservation = streams.reserve();
        try {
            SearchQuestionAcceptedResult accepted = intake.acceptFirst(
                    workspaceId,
                    member.getMemberId(),
                    command
            );
            SseEmitter emitter = streams.open(
                    workspaceId,
                    member.getMemberId(),
                    accepted,
                    reservation
            );
            return eventStream(emitter);
        } catch (RuntimeException exception) {
            reservation.close();
            throw exception;
        }
    }

    private ResponseEntity<SseEmitter> eventStream(SseEmitter emitter) {
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
