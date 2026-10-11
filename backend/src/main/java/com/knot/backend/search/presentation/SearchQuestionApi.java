package com.knot.backend.search.presentation;

import static com.knot.backend.global.config.OpenApiConfig.ACCESS_TOKEN_COOKIE;

import com.knot.backend.auth.domain.AuthenticatedMember;
import com.knot.backend.search.presentation.dto.request.SearchQuestionRequest;
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
public interface SearchQuestionApi {

    @Operation(summary = "탐색 첫 질문 접수와 대화 생성", description = "현재 Workspace 멤버의 질문을 원자적으로 접수합니다. "
            + "DB 커밋 뒤 accepted를 먼저 전송하며 생성은 연결 해제 후에도 계속됩니다. "
            + "같은 requestId·본문은 기존 ID와 현재 본문부터 복구합니다. 클라이언트는 기존 답변 버퍼를 교체해야 합니다.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "accepted → progress/delta/evidence/excluded_documents → completed/failed/stopped 후 EOF", content = @Content(mediaType = "text/event-stream")),
            @ApiResponse(responseCode = "400", description = "VALIDATION_ERROR 또는 INVALID_REQUEST_BODY/INVALID_PARAMETER"),
            @ApiResponse(responseCode = "401", description = "UNAUTHENTICATED"),
            @ApiResponse(responseCode = "403", description = "WORKSPACE_ACCESS_DENIED 또는 CSRF FORBIDDEN"),
            @ApiResponse(responseCode = "409", description = "REQUEST_ID_CONFLICT"),
            @ApiResponse(responseCode = "500", description = "ANSWER_GENERATION_UNAVAILABLE 또는 접수 전 저장 오류")})
    ResponseEntity<SseEmitter> create(
            Long workspaceId,
            SearchQuestionRequest request,
            @Parameter(hidden = true) AuthenticatedMember member
    );
}
