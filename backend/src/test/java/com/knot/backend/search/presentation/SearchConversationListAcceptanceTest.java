package com.knot.backend.search.presentation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.knot.backend.auth.domain.AuthTokenProvider;
import com.knot.backend.auth.domain.AuthenticatedMember;
import com.knot.backend.document.DocumentFixtures;
import com.knot.backend.search.SearchFixtures;
import com.knot.backend.search.domain.SearchConversationCursor;
import com.knot.backend.testsupport.TestApplicationProperties;
import com.knot.backend.testsupport.TestcontainersConfiguration;
import jakarta.servlet.http.Cookie;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.json.JsonMapper;

@Tag("acceptance")
@ActiveProfiles("dev")
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@TestApplicationProperties
class SearchConversationListAcceptanceTest {
    private static final String PATH = "/api/v1/workspaces/{workspaceId}/search/conversations";

    @Autowired
    private MockMvc mvc;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private AuthTokenProvider tokens;
    @Autowired
    private JsonMapper json;
    private DocumentFixtures members;
    private SearchFixtures fixtures;
    private long workspaceId;
    private long memberId;

    @BeforeEach
    void setUp() {
        jdbc.sql("TRUNCATE TABLE members, workspaces RESTART IDENTITY CASCADE")
                .update();
        members = new DocumentFixtures(jdbc);
        fixtures = new SearchFixtures(jdbc);
        memberId = members.saveMember("조회자");
        workspaceId = members.saveWorkspace();
        members.join(
                workspaceId,
                memberId
        );
    }

    @Test
    @DisplayName("대화가 없으면 빈 목록과 null 커서를 반환한다")
    void find_success_emptyWorkspace() throws Exception {
        mvc.perform(request(memberId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty())
                .andExpect(jsonPath("$.nextCursor").value(nullValue()));
    }

    @Test
    @DisplayName("쿠키 인증으로 응답 계약을 읽고 저장 상태는 바꾸지 않는다")
    void find_success_cookieAuthenticationResponseAndReadOnly() throws Exception {
        long id = fixtures.saveConversation(
                workspaceId,
                memberId,
                "  질문\n제목  ",
                " 답변\t미리보기 "
        );
        String before = snapshot();

        mvc.perform(request(memberId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(id))
                .andExpect(jsonPath("$.items[0].title").value("질문 제목"))
                .andExpect(jsonPath("$.items[0].lastMessagePreview").value("답변 미리보기"))
                .andExpect(jsonPath("$.items[0].createdAt").value("2026-10-11T00:00:00.123456Z"))
                .andExpect(jsonPath("$.items[0].updatedAt").value("2026-10-11T00:00:00.123456Z"))
                .andExpect(jsonPath("$.items[0].content").doesNotExist())
                .andExpect(jsonPath("$.nextCursor").value(nullValue()));

        assertThat(snapshot()).isEqualTo(before);
    }

    @ParameterizedTest
    @CsvSource({"FAILED,false,1", "STREAMING,false,1", "COMPLETED,true,2"})
    @DisplayName("개인 범위에서 첫 답변 실패와 재시도 중에는 숨기고 성공 후 복원한다")
    void find_success_privateConversationsAndFirstAnswerVisibility(
            String answerStatus,
            boolean visible,
            int count
    ) throws Exception {
        long mine = fixtures.saveConversation(
                workspaceId,
                memberId,
                "질문",
                ""
        );
        long otherMember = members.saveMember("다른 멤버");
        members.join(
                workspaceId,
                otherMember
        );
        fixtures.saveConversation(
                workspaceId,
                otherMember,
                "비공개 질문",
                "비공개 답변"
        );
        fixtures.saveConversation(
                members.saveWorkspace(),
                memberId,
                "다른 공간",
                "다른 공간"
        );
        long failed = fixtures.saveConversation(
                workspaceId,
                memberId,
                "실패한 첫 질문",
                "부분 답변"
        );
        fixtures.setAnswerStatus(
                failed,
                answerStatus
        );
        fixtures.setVisible(
                failed,
                visible
        );
        fixtures.saveEmptyConversation(
                workspaceId,
                memberId,
                SearchFixtures.TIME
        );

        mvc.perform(request(memberId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(count))
                .andExpect(
                        jsonPath("$.items[0].id").value(
                                firstVisibleId(
                                        visible,
                                        mine,
                                        failed
                                )
                        )
                )
                .andExpect(jsonPath("$.nextCursor").value(nullValue()));
    }

    @Test
    @DisplayName("같은 시각의 첫 페이지는 가장 큰 ID와 다음 커서를 반환한다")
    void find_success_firstCursorPage() throws Exception {
        List<Long> ids = saveConversations(3);
        long third = ids.get(2);
        String body = mvc.perform(
                request(memberId).param(
                        "size",
                        "1"
                )
        )
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(third))
                .andExpect(jsonPath("$.nextCursor").isString())
                .andReturn()
                .getResponse()
                .getContentAsString();
        String cursor = json.readTree(body)
                .get("nextCursor")
                .asString();

        assertThat(
                SearchConversationCursor.parse(
                        cursor,
                        workspaceId,
                        memberId
                )
        ).usingRecursiveComparison()
                .isEqualTo(
                        SearchConversationCursor.of(
                                workspaceId,
                                memberId,
                                SearchFixtures.TIME,
                                third
                        )
                );
    }

    @Test
    @DisplayName("커서 뒤 페이지는 크기를 바꿔도 이전 대화를 중복 없이 반환한다")
    void find_success_cursorPageWithDifferentSize() throws Exception {
        List<Long> ids = saveConversations(3);
        String cursor = SearchConversationCursor.of(
                workspaceId,
                memberId,
                SearchFixtures.TIME,
                ids.get(2)
        )
                .encode();

        mvc.perform(
                request(memberId).param(
                        "size",
                        "100"
                )
                        .param(
                                "cursor",
                                cursor
                        )
        )
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].id").value(ids.get(1)))
                .andExpect(jsonPath("$.items[1].id").value(ids.get(0)))
                .andExpect(jsonPath("$.nextCursor").value(nullValue()));
    }

    @ParameterizedTest
    @CsvSource(value = {"NULL,20", "100,100"}, nullValues = "NULL")
    @DisplayName("기본 20개와 최대 100개를 반환한다")
    void find_success_pageSize(
            String size,
            int count
    ) throws Exception {
        saveConversations(101);
        MockHttpServletRequestBuilder request = request(memberId);
        if (size != null) {
            request.param(
                    "size",
                    size
            );
        }

        mvc.perform(request)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(count))
                .andExpect(jsonPath("$.nextCursor").isString());
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "invalid"})
    @DisplayName("누락하거나 잘못된 쿠키는 401로 거절한다")
    void find_failure_unauthenticated(String token) throws Exception {
        MockHttpServletRequestBuilder request = get(
                PATH,
                workspaceId
        );
        if (!token.isEmpty()) {
            request.cookie(
                    new Cookie(
                            "KNOT_ACCESS_TOKEN",
                            token
                    )
            );
        }

        mvc.perform(request)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    @DisplayName("현재 멤버가 아니거나 탈퇴한 멤버는 403으로 거절한다")
    void find_failure_inactiveMembership(boolean formerMember) throws Exception {
        long requester = members.saveMember("비회원");
        if (formerMember) {
            members.leave(
                    workspaceId,
                    memberId
            );
            requester = memberId;
        }

        mvc.perform(request(requester))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("WORKSPACE_ACCESS_DENIED"));
    }

    @Test
    @DisplayName("삭제된 Workspace는 403으로 거절한다")
    void find_failure_deletedWorkspace() throws Exception {
        jdbc.sql("UPDATE workspaces SET deleted_at = CURRENT_TIMESTAMP WHERE id = :id")
                .param(
                        "id",
                        workspaceId
                )
                .update();
        mvc.perform(request(memberId))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("WORKSPACE_ACCESS_DENIED"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-1", "101", "abc", "2147483648"})
    @DisplayName("크기 형식과 허용 범위를 벗어나면 400으로 거절한다")
    void find_failure_invalidSize(String size) throws Exception {
        mvc.perform(
                request(memberId).param(
                        "size",
                        size
                )
        )
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PARAMETER"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "%%%", "broken"})
    @DisplayName("빈 커서와 손상된 커서는 400으로 거절한다")
    void find_failure_invalidCursor(String cursor) throws Exception {
        mvc.perform(
                request(memberId).param(
                        "cursor",
                        cursor
                )
        )
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PARAMETER"));
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    @DisplayName("다른 Workspace 또는 멤버의 커서는 400으로 거절한다")
    void find_failure_cursorFromOtherScope(boolean otherWorkspace) throws Exception {
        long cursorWorkspace = workspaceId;
        long cursorMember = memberId + 1;
        if (otherWorkspace) {
            cursorWorkspace = workspaceId + 1;
            cursorMember = memberId;
        }
        String cursor = SearchConversationCursor.of(
                cursorWorkspace,
                cursorMember,
                SearchFixtures.TIME,
                1
        )
                .encode();

        mvc.perform(
                request(memberId).param(
                        "cursor",
                        cursor
                )
        )
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PARAMETER"));
    }

    @Test
    @DisplayName("OpenAPI에 GET 응답과 인증 오류 계약이 포함된다")
    void find_success_openApiDocumentsContract() throws Exception {
        String response = mvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        var api = json.readTree(response);
        var operation = api.get("paths")
                .get(PATH)
                .get("get");

        assertThat(
                operation.get("responses")
                        .has("200")
        ).isTrue();
        assertThat(
                operation.get("responses")
                        .has("400")
        ).isTrue();
        assertThat(
                operation.get("responses")
                        .has("401")
        ).isTrue();
        assertThat(
                operation.get("responses")
                        .has("403")
        ).isTrue();
        assertThat(operation.toString()).doesNotContain("X-XSRF-TOKEN");
        assertThat(
                api.get("components")
                        .get("schemas")
                        .get("SearchConversationListResponse")
                        .get("required")
                        .toString()
        ).contains(
                "items",
                "nextCursor"
        );
    }

    private List<Long> saveConversations(int count) {
        ArrayList<Long> ids = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            ids.add(
                    fixtures.saveConversation(
                            workspaceId,
                            memberId,
                            "질문 " + i,
                            "답변"
                    )
            );
        }
        return ids;
    }

    private long firstVisibleId(
            boolean visible,
            long mine,
            long restored
    ) {
        if (visible) {
            return restored;
        }
        return mine;
    }

    private String snapshot() {
        return jdbc.sql("SELECT row_to_json(c)::text FROM search_conversations c ORDER BY id")
                .query(String.class)
                .list()
                .toString()
                + jdbc.sql("SELECT row_to_json(m)::text FROM search_messages m ORDER BY id")
                        .query(String.class)
                        .list()
                        .toString();
    }

    private MockHttpServletRequestBuilder request(long member) {
        String token = tokens.issue(
                AuthenticatedMember.of(
                        member,
                        "멤버",
                        null
                )
        );
        return get(
                PATH,
                workspaceId
        ).cookie(
                new Cookie(
                        "KNOT_ACCESS_TOKEN",
                        token
                )
        );
    }
}
