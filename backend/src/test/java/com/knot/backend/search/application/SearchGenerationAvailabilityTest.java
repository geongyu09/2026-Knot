package com.knot.backend.search.application;

import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.knot.backend.global.config.SearchWorkerProperties;
import com.knot.backend.search.domain.SearchException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

@org.junit.jupiter.api.extension.ExtendWith(org.mockito.junit.jupiter.MockitoExtension.class)
class SearchGenerationAvailabilityTest {

    @org.mockito.Mock
    private ObjectProvider<SearchDocumentRetriever> retrieverProvider;
    @org.mockito.Mock
    private ObjectProvider<SearchAnswerGenerator> generatorProvider;

    @Test
    @DisplayName("worker 활성화와 실제 검색·생성 adapter 두 개가 있어야 접수할 수 있다")
    void requireAvailable_success() {
        SearchWorkerProperties properties = new SearchWorkerProperties();
        properties.setEnabled(true);
        ObjectProvider<SearchDocumentRetriever> retrievers = retrieverProvider;
        ObjectProvider<SearchAnswerGenerator> generators = generatorProvider;
        when(retrievers.getIfAvailable()).thenReturn(mock(SearchDocumentRetriever.class));
        when(generators.getIfAvailable()).thenReturn(mock(SearchAnswerGenerator.class));
        assertThatNoException().isThrownBy(
                () -> new SearchGenerationAvailability(
                        properties,
                        retrievers,
                        generators
                ).requireAvailable()
        );
    }

    @Test
    @DisplayName("worker 비활성은 접수 전 unavailable이다")
    void requireAvailable_failure_disabled() {
        SearchWorkerProperties properties = new SearchWorkerProperties();
        assertThatExceptionOfType(SearchException.class).isThrownBy(
                () -> new SearchGenerationAvailability(
                        properties,
                        retrieverProvider,
                        generatorProvider
                ).requireAvailable()
        );
    }

    @Test
    @DisplayName("검색 adapter 미연결은 접수 전 unavailable이다")
    void requireAvailable_failure_missingRetriever() {
        SearchWorkerProperties properties = new SearchWorkerProperties();
        properties.setEnabled(true);
        assertThatExceptionOfType(SearchException.class).isThrownBy(
                () -> new SearchGenerationAvailability(
                        properties,
                        retrieverProvider,
                        generatorProvider
                ).requireAvailable()
        );
    }

    @Test
    @DisplayName("생성 adapter 미연결은 접수 전 unavailable이다")
    void requireAvailable_failure_missingGenerator() {
        SearchWorkerProperties properties = new SearchWorkerProperties();
        properties.setEnabled(true);
        when(retrieverProvider.getIfAvailable()).thenReturn(mock(SearchDocumentRetriever.class));
        assertThatExceptionOfType(SearchException.class).isThrownBy(
                () -> new SearchGenerationAvailability(
                        properties,
                        retrieverProvider,
                        generatorProvider
                ).requireAvailable()
        );
    }
}
