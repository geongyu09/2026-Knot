package com.knot.ai.transcription.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;

class WindowEvidenceTest {
    @Test
    void silentWindowIsAllowedWhileLegacyEmptyResultIsRejected() {
        // given
        WindowEvidence window = new WindowEvidence(
                1,
                "v1",
                "a".repeat(64),
                0,
                16000,
                "model",
                List.of(),
                List.of()
        );
        // when
        TranscriptResult result = new TranscriptResult(
                1,
                "{\"transcription\":[]}",
                List.of(),
                window
        );
        // then
        assertThat(result.utterances()).isEmpty();
        assertThatThrownBy(
                () -> new TranscriptResult(
                        1,
                        "{}",
                        List.of()
                )
        ).isInstanceOf(TranscriptionException.class);
    }

    @Test
    void rejectsNonfiniteEmbeddingAndTokenOutsideInput() {
        // given
        List<Double> vector = Collections.nCopies(
                512,
                Double.NaN
        );
        // when
        Throwable invalid = org.assertj.core.api.Assertions.catchThrowable(
                () -> new WindowEvidence.Speaker(
                        "s",
                        vector,
                        16000
                )
        );
        // then
        assertThat(invalid).isInstanceOf(TranscriptionException.class);
        assertThatThrownBy(
                () -> new WindowEvidence(
                        1,
                        "v1",
                        "a".repeat(64),
                        0,
                        16000,
                        "model",
                        List.of(
                                new WindowEvidence.Token(
                                        0,
                                        16001,
                                        "word",
                                        "s"
                                )
                        ),
                        List.of(
                                new WindowEvidence.Speaker(
                                        "s",
                                        List.of(),
                                        16000
                                )
                        )
                )
        ).isInstanceOf(TranscriptionException.class);
    }
}
