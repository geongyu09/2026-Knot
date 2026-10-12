package com.knot.backend.global.exception;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class GlobalExceptionHandlerMvcTest {

    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new HttpErrorProbeController())
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    @DisplayName("정상 GET은 기존 성공 응답을 유지한다")
    void read_success() throws Exception {
        // given
        MockHttpServletRequestBuilder request = get("/api/v1/test/http-errors/ok");

        // when & then
        mvc.perform(request)
                .andExpect(status().isOk())
                .andExpect(content().string("ok"));
    }

    @Test
    @DisplayName("정상 JSON 요청은 기존 성공 본문을 유지한다")
    void create_success() throws Exception {
        // given
        MockHttpServletRequestBuilder request = post("/api/v1/test/http-errors/json");
        request.contentType(MediaType.APPLICATION_JSON);
        request.content("{\"value\":\"ok\"}");

        // when & then
        mvc.perform(request)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.value").value("ok"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"application/json", "text/event-stream"})
    @DisplayName("없는 경로는 내부 오류 대신 공통 JSON 404로 응답한다")
    void read_failure_pathNotFound(String accept) throws Exception {
        // given
        MockHttpServletRequestBuilder request = get("/api/v1/test/http-errors/missing");
        request.accept(accept);

        // when & then
        mvc.perform(request)
                .andExpect(status().isNotFound())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.code").value("REQUEST_PATH_NOT_FOUND"))
                .andExpect(jsonPath("$.message").value("요청 경로를 찾을 수 없습니다"))
                .andExpect(jsonPath("$.fieldErrors").doesNotExist());
    }

    @ParameterizedTest
    @ValueSource(strings = {"application/json", "text/event-stream"})
    @DisplayName("지원하지 않는 메서드는 공통 JSON 405와 Allow로 응답한다")
    void read_failure_methodNotAllowed(String accept) throws Exception {
        // given
        MockHttpServletRequestBuilder request = post("/api/v1/test/http-errors/ok");
        request.accept(accept);

        // when & then
        mvc.perform(request)
                .andExpect(status().isMethodNotAllowed())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(
                        header().string(
                                HttpHeaders.ALLOW,
                                "GET"
                        )
                )
                .andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"application/json", "text/event-stream"})
    @DisplayName("지원하지 않는 요청 형식은 공통 JSON 415와 지원 형식 헤더로 응답한다")
    void create_failure_unsupportedMediaType(String accept) throws Exception {
        // given
        MockHttpServletRequestBuilder request = post("/api/v1/test/http-errors/json");
        request.contentType(MediaType.TEXT_PLAIN);
        request.content("ok");
        request.accept(accept);

        // when & then
        mvc.perform(request)
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(
                        header().string(
                                HttpHeaders.ACCEPT,
                                MediaType.APPLICATION_JSON_VALUE
                        )
                )
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_MEDIA_TYPE"));
    }

    @Test
    @DisplayName("JSON 구문 오류는 415 대신 기존 400을 유지한다")
    void create_failure_malformedJson() throws Exception {
        // given
        MockHttpServletRequestBuilder request = post("/api/v1/test/http-errors/json");
        request.contentType(MediaType.APPLICATION_JSON);
        request.content("{");

        // when & then
        mvc.perform(request)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST_BODY"));
    }

    @Test
    @DisplayName("입력 validation 오류는 기존 400과 필드 오류를 유지한다")
    void create_failure_validation() throws Exception {
        // given
        MockHttpServletRequestBuilder request = post("/api/v1/test/http-errors/json");
        request.contentType(MediaType.APPLICATION_JSON);
        request.content("{\"value\":\"\"}");

        // when & then
        mvc.perform(request)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("value"));
    }

    @Test
    @DisplayName("서버 내부 실패는 원문 원인을 노출하지 않는 기존 500을 유지한다")
    void read_failure_internalError() throws Exception {
        // given
        MockHttpServletRequestBuilder request = get("/api/v1/test/http-errors/internal");

        // when & then
        mvc.perform(request)
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_SERVER_ERROR"))
                .andExpect(jsonPath("$.message").value("서버 오류가 발생했습니다"))
                .andExpect(jsonPath("$.fieldErrors").doesNotExist());
    }
}
