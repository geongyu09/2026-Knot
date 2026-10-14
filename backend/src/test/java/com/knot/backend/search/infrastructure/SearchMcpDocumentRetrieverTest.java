package com.knot.backend.search.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import com.knot.backend.global.config.SearchAgentProperties;
import com.knot.backend.search.application.SearchToolAccess;
import com.knot.backend.search.application.SearchToolScope;
import com.knot.backend.search.application.dto.result.SearchRetrievalResult;
import com.knot.backend.search.domain.SearchToolException;
import com.knot.backend.search.infrastructure.mcp.SearchMcpClient;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class SearchMcpDocumentRetrieverTest {

    private final JsonMapper mapper = JsonMapper.builder()
            .build();
    private final SearchLlmClient llm = mock(SearchLlmClient.class);
    private final SearchMcpClient mcp = mock(SearchMcpClient.class);
    private final SearchToolAccess access = mock(SearchToolAccess.class);
    private final SearchHistoryQuery history = mock(SearchHistoryQuery.class);
    private final SearchAgentProperties properties = new SearchAgentProperties();
    private SearchMcpDocumentRetriever retriever;
    private SearchToolScope scope;

    @BeforeEach
    void setUp() {
        Instant now = Instant.now();
        scope = new SearchToolScope(
                1,
                1,
                1,
                1,
                2,
                UUID.randomUUID(),
                now,
                now.plusSeconds(120)
        );
        when(mcp.definitions(scope)).thenReturn(List.of());
        when(history.beforeQuestion(scope)).thenReturn(List.of());
        retriever = new SearchMcpDocumentRetriever(
                llm,
                mcp,
                history,
                access,
                properties,
                mapper
        );
    }

    @Test
    @DisplayName("검색 후보는 근거로 넘기지 않고 실제 읽은 본문만 생성기에 전달한다")
    void retrieve_success_readDocumentsOnly() {
        when(
                llm.complete(
                        eq(scope),
                        any(),
                        any()
                )
        ).thenReturn(
                turn(
                        "t1",
                        "search_documents",
                        "{\"query\":\"결정\"}"
                ),
                turn(
                        "t2",
                        "read_document",
                        "{\"documentId\":1}"
                ),
                mapper.readTree("{\"role\":\"assistant\",\"content\":\"탐색 종료\"}")
        );
        when(
                mcp.call(
                        eq(scope),
                        eq("search_documents"),
                        any()
                )
        ).thenReturn(mapper.readTree("{\"items\":[{\"documentId\":1},{\"documentId\":2}],\"nextCursor\":null}"));
        when(
                mcp.call(
                        eq(scope),
                        eq("read_document"),
                        any()
                )
        ).thenReturn(
                mapper.readTree(
                        "{\"document\":{\"documentId\":1,\"title\":\"회의\",\"topic\":\"결정\",\"contentRevision\":\"r1\"},\"content\":\"실제 읽은 본문\",\"offset\":0,\"truncated\":false,\"nextCursor\":null}"
                )
        );
        com.knot.backend.search.application.dto.result.SearchRetrievalResult result = retriever.retrieve(
                scope,
                "결정"
        );
        assertThat(result.documents()).hasSize(1);
        assertThat(
                result.documents()
                        .getFirst()
                        .content()
        ).isEqualTo("실제 읽은 본문");
        assertThat(result.excludedCount()).isZero();
    }

    @Test
    @DisplayName("검색에 성공했지만 후보를 읽지 않으면 결과 없음으로 완료하지 않는다")
    void retrieve_failure_unreadCandidates() {
        when(
                llm.complete(
                        eq(scope),
                        any(),
                        any()
                )
        ).thenReturn(
                turn(
                        "t1",
                        "list_documents",
                        "{}"
                ),
                mapper.readTree("{\"role\":\"assistant\",\"content\":\"끝\"}")
        );
        when(
                mcp.call(
                        eq(scope),
                        eq("list_documents"),
                        any()
                )
        ).thenReturn(mapper.readTree("{\"items\":[{\"documentId\":1}]}"));
        assertThatThrownBy(
                () -> retriever.retrieve(
                        scope,
                        "질문"
                )
        ).hasMessage("INCOMPLETE_DOCUMENT_EXPLORATION");
    }

    @Test
    @DisplayName("검색 결과 없이 전체 목록만 발견하면 모델의 자유 답변 대신 빈 근거를 반환한다")
    void retrieve_success_noSearchMatchesWithListedDocuments() {
        // given
        when(
                llm.complete(
                        eq(scope),
                        any(),
                        any()
                )
        ).thenReturn(
                turn(
                        "search",
                        "search_documents",
                        "{\"query\":\"점심\"}"
                ),
                turn(
                        "list",
                        "list_documents",
                        "{}"
                ),
                mapper.readTree("{\"role\":\"assistant\",\"content\":\"모델이 임의로 작성한 답변\",\"tool_calls\":[]}")
        );
        when(
                mcp.call(
                        eq(scope),
                        eq("search_documents"),
                        any()
                )
        ).thenReturn(mapper.readTree("{\"items\":[]}"));
        when(
                mcp.call(
                        eq(scope),
                        eq("list_documents"),
                        any()
                )
        ).thenReturn(mapper.readTree("{\"items\":[{\"documentId\":1,\"title\":\"결제 결정\"}]}"));

        // when
        SearchRetrievalResult result = retriever.retrieve(
                scope,
                "점심"
        );

        // then
        assertThat(result.documents()).isEmpty();
        assertThat(result.excludedCount()).isZero();
        verify(
                mcp,
                never()
        ).call(
                eq(scope),
                eq("read_document"),
                any()
        );
    }

    @Test
    @DisplayName("검색 도구 오류는 결과 없음으로 변환하지 않고 그대로 실패한다")
    void retrieve_failure_searchToolError() {
        // given
        when(
                llm.complete(
                        eq(scope),
                        any(),
                        any()
                )
        ).thenReturn(
                turn(
                        "search",
                        "search_documents",
                        "{\"query\":\"점심\"}"
                )
        );
        when(
                mcp.call(
                        eq(scope),
                        eq("search_documents"),
                        any()
                )
        ).thenThrow(new SearchToolException("SEARCH_TRANSPORT_FAILED"));

        // when & then
        assertThatThrownBy(
                () -> retriever.retrieve(
                        scope,
                        "점심"
                )
        ).hasMessage("SEARCH_TRANSPORT_FAILED");
    }

    @Test
    @DisplayName("같은 도구 입력을 반복하면 실패한다")
    void retrieve_failure_repeatedToolCall() {
        when(
                llm.complete(
                        eq(scope),
                        any(),
                        any()
                )
        ).thenReturn(
                turn(
                        "t1",
                        "list_documents",
                        "{}"
                ),
                turn(
                        "t2",
                        "list_documents",
                        "{}"
                )
        );
        when(
                mcp.call(
                        eq(scope),
                        eq("list_documents"),
                        any()
                )
        ).thenReturn(mapper.readTree("{\"items\":[]}"));
        assertThatThrownBy(
                () -> retriever.retrieve(
                        scope,
                        "질문"
                )
        ).hasMessage("REPEATED_TOOL_CALL");
    }

    @Test
    void retrieve_success_exactToolLimit() {
        properties.setToolCallLimit(1);
        when(
                llm.complete(
                        eq(scope),
                        any(),
                        any()
                )
        ).thenReturn(
                turn(
                        "t1",
                        "list_documents",
                        "{}"
                ),
                mapper.readTree("{\"role\":\"assistant\",\"content\":\"끝\"}")
        );
        when(
                mcp.call(
                        eq(scope),
                        eq("list_documents"),
                        any()
                )
        ).thenReturn(mapper.readTree("{\"items\":[]}"));
        assertThat(
                retriever.retrieve(
                        scope,
                        "질문"
                )
                        .documents()
        ).isEmpty();
        org.mockito.Mockito.verify(mcp)
                .call(
                        eq(scope),
                        eq("list_documents"),
                        any()
                );
    }

    @Test
    void retrieve_failure_toolLimitPlusOne() {
        properties.setToolCallLimit(1);
        when(
                llm.complete(
                        eq(scope),
                        any(),
                        any()
                )
        ).thenReturn(
                turn(
                        "t1",
                        "list_documents",
                        "{}"
                ),
                turn(
                        "t2",
                        "list_documents",
                        "{\"cursor\":\"next\"}"
                )
        );
        when(
                mcp.call(
                        eq(scope),
                        eq("list_documents"),
                        any()
                )
        ).thenReturn(mapper.readTree("{\"items\":[]}"));
        assertThatThrownBy(
                () -> retriever.retrieve(
                        scope,
                        "질문"
                )
        ).hasMessage("SEARCH_TOOL_LIMIT_EXCEEDED");
        org.mockito.Mockito.verify(mcp)
                .call(
                        eq(scope),
                        eq("list_documents"),
                        any()
                );
    }

    @Test
    void retrieve_success_largeWorkspaceUsesBoundedPages() {
        when(
                llm.complete(
                        eq(scope),
                        any(),
                        any()
                )
        ).thenReturn(
                turn(
                        "t1",
                        "list_documents",
                        "{\"size\":100}"
                ),
                turn(
                        "t2",
                        "read_document",
                        "{\"documentId\":1}"
                ),
                mapper.readTree("{\"role\":\"assistant\",\"content\":\"끝\"}")
        );
        List<Map<String, Object>> ninety = java.util.stream.IntStream.rangeClosed(
                1,
                90
        )
                .mapToObj(
                        id -> Map.<String, Object>of(
                                "documentId",
                                id,
                                "title",
                                "회의",
                                "snippet",
                                "문서".repeat(200)
                        )
                )
                .toList();
        when(
                mcp.call(
                        eq(scope),
                        eq("list_documents"),
                        any()
                )
        ).thenAnswer(invocation -> {
            Map<String, Object> arguments = invocation.getArgument(2);
            int size = ((Number) arguments.get("size")).intValue();
            return mapper.valueToTree(
                    Map.of(
                            "items",
                            ninety.subList(
                                    0,
                                    size
                            ),
                            "nextCursor",
                            "next-page"
                    )
            );
        });
        when(
                mcp.call(
                        eq(scope),
                        eq("read_document"),
                        any()
                )
        ).thenReturn(
                mapper.readTree(
                        "{\"document\":{\"documentId\":1,\"title\":\"회의\",\"topic\":\"결정\",\"contentRevision\":\"r1\"},\"content\":\"읽은 본문\",\"offset\":0,\"truncated\":false}"
                )
        );
        assertThat(
                retriever.retrieve(
                        scope,
                        "결정"
                )
                        .documents()
        ).hasSize(1);
        org.mockito.Mockito.verify(mcp)
                .call(
                        scope,
                        "list_documents",
                        Map.of(
                                "size",
                                20
                        )
                );
    }

    private JsonNode turn(
            String id,
            String name,
            String arguments
    ) {
        return mapper.valueToTree(
                Map.of(
                        "role",
                        "assistant",
                        "tool_calls",
                        List.of(
                                Map.of(
                                        "id",
                                        id,
                                        "type",
                                        "function",
                                        "function",
                                        Map.of(
                                                "name",
                                                name,
                                                "arguments",
                                                arguments
                                        )
                                )
                        )
                )
        );
    }
}
