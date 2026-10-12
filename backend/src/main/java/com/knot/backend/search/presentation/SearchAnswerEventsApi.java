package com.knot.backend.search.presentation;

import static com.knot.backend.global.config.OpenApiConfig.ACCESS_TOKEN_COOKIE;

import com.knot.backend.auth.domain.AuthenticatedMember;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Tag(name = "탐색", description = "Search V2 개인 대화")
@SecurityRequirement(name = ACCESS_TOKEN_COOKIE)
public interface SearchAnswerEventsApi {

    @Operation(summary = "탐색 답변 SSE 재연결", description = "저장 snapshot을 먼저 보내고 같은 실행에서 추가된 본문만 delta로 보냅니다. "
            + "본문은 snapshot으로 교체하고 delta를 이어 붙입니다. 종료된 답변은 근거·종료 상태 후 EOF를 보냅니다. "
            + "연결 종료는 생성을 취소하지 않으며 이벤트 replay와 제외 수 복원은 제공하지 않습니다.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "snapshot → delta/evidence → completed/failed/stopped. 모든 payload는 answerId 사용", content = @Content(mediaType = "text/event-stream")),
            @ApiResponse(responseCode = "400", description = "INVALID_PARAMETER: path 형식 오류"),
            @ApiResponse(responseCode = "401", description = "UNAUTHENTICATED"),
            @ApiResponse(responseCode = "403", description = "SEARCH_ACCESS_DENIED"),
            @ApiResponse(responseCode = "404", description = "ANSWER_NOT_FOUND: 답변 없음, 역할 또는 대화 불일치"),
            @ApiResponse(responseCode = "500", description = "ANSWER_GENERATION_UNAVAILABLE 또는 조회 오류")})
    ResponseEntity<SseEmitter> reconnect(
            Long workspaceId,
            Long conversationId,
            Long answerId,
            @Parameter(hidden = true) AuthenticatedMember member
    );
}
