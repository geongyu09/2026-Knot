package com.knot.backend.search.presentation;

import static com.knot.backend.global.config.OpenApiConfig.ACCESS_TOKEN_COOKIE;

import com.knot.backend.auth.domain.model.AuthenticatedMember;
import com.knot.backend.search.presentation.dto.request.SearchQuestionRequest;
import com.knot.backend.search.presentation.dto.request.SearchAnswerRetryRequest;
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

    @Operation(summary = "실패한 탐색 답변 재시도", description = "기존 USER 질문과 FAILED 답변 ID를 재사용합니다. "
            + "접수 시 부분 본문·오류·근거를 초기화하며 같은 requestId는 기존 시도를 복구합니다. " + "새 시도로 교체된 이전 요청 연결은 accepted 후 EOF로 종료합니다.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "accepted(questionId, answerMessageId, STREAMING) 후 공통 생성 SSE", content = @Content(mediaType = "text/event-stream")),
            @ApiResponse(responseCode = "400", description = "VALIDATION_ERROR 또는 INVALID_REQUEST_BODY/INVALID_PARAMETER"),
            @ApiResponse(responseCode = "401", description = "UNAUTHENTICATED"),
            @ApiResponse(responseCode = "403", description = "SEARCH_ACCESS_DENIED 또는 CSRF FORBIDDEN"),
            @ApiResponse(responseCode = "404", description = "QUESTION_NOT_FOUND"),
            @ApiResponse(responseCode = "409", description = "ANSWER_NOT_FAILED/ANSWER_ALREADY_IN_PROGRESS/REQUEST_ID_CONFLICT"),
            @ApiResponse(responseCode = "500", description = "ANSWER_GENERATION_UNAVAILABLE 또는 접수 전 저장 오류")})
    ResponseEntity<SseEmitter> retry(
            Long workspaceId,
            Long conversationId,
            Long questionId,
            SearchAnswerRetryRequest request,
            @Parameter(hidden = true) AuthenticatedMember member
    );

    @Operation(summary = "기존 탐색 대화의 후속 질문 접수", description = "현재 Workspace 멤버이자 대화 소유자의 질문과 답변을 접수합니다. "
            + "같은 requestId·원문은 진행 중 검사보다 먼저 기존 ID를 반환합니다. "
            + "accepted 뒤 저장된 본문부터 delta로 전송하므로 재접수 시 클라이언트는 답변 버퍼를 교체해야 합니다. "
            + "이전 COMPLETED·STOPPED 문맥을 사용하며 연결 종료만으로 생성을 중단하지 않습니다.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "accepted → progress/delta/evidence/excluded_documents → completed/failed/stopped 후 EOF", content = @Content(mediaType = "text/event-stream")),
            @ApiResponse(responseCode = "400", description = "VALIDATION_ERROR 또는 INVALID_REQUEST_BODY/INVALID_PARAMETER"),
            @ApiResponse(responseCode = "401", description = "UNAUTHENTICATED"),
            @ApiResponse(responseCode = "403", description = "SEARCH_ACCESS_DENIED 또는 CSRF FORBIDDEN"),
            @ApiResponse(responseCode = "404", description = "CONVERSATION_NOT_FOUND"),
            @ApiResponse(responseCode = "409", description = "ANSWER_ALREADY_IN_PROGRESS 또는 REQUEST_ID_CONFLICT"),
            @ApiResponse(responseCode = "500", description = "ANSWER_GENERATION_UNAVAILABLE 또는 접수 전 저장 오류")})
    ResponseEntity<SseEmitter> ask(
            Long workspaceId,
            Long conversationId,
            SearchQuestionRequest request,
            @Parameter(hidden = true) AuthenticatedMember member
    );

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
