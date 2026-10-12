package com.knot.backend.search.presentation;

import static com.knot.backend.global.config.OpenApiConfig.ACCESS_TOKEN_COOKIE;

import com.knot.backend.auth.domain.AuthenticatedMember;
import com.knot.backend.search.presentation.dto.response.SearchAnswerStopResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;

@Tag(name = "탐색", description = "Search V2 개인 대화")
@SecurityRequirement(name = ACCESS_TOKEN_COOKIE)
public interface SearchAnswerStopApi {

    @Operation(summary = "탐색 답변 생성 중지", description = "요청 본문 없이 명시적으로 중지합니다. 저장된 부분 본문을 보존하며 이미 STOPPED인 요청도 200으로 반환합니다. "
            + "먼저 완료·실패한 답변은 409입니다. 공급자 연결 취소는 저장 후 전달됩니다.")
    @ApiResponses({@ApiResponse(responseCode = "200", description = "STOPPED와 저장된 부분 본문"),
            @ApiResponse(responseCode = "401", description = "UNAUTHENTICATED"),
            @ApiResponse(responseCode = "403", description = "SEARCH_ACCESS_DENIED 또는 FORBIDDEN(CSRF)"),
            @ApiResponse(responseCode = "404", description = "ANSWER_NOT_FOUND"),
            @ApiResponse(responseCode = "409", description = "ANSWER_NOT_RUNNING"),
            @ApiResponse(responseCode = "500", description = "ANSWER_GENERATION_UNAVAILABLE 또는 저장 오류")})
    ResponseEntity<SearchAnswerStopResponse> stop(
            Long workspaceId,
            Long conversationId,
            Long answerId,
            @Parameter(hidden = true) AuthenticatedMember member
    );
}
