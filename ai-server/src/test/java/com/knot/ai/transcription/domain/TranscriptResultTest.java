package com.knot.ai.transcription.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class TranscriptResultTest {

    @Test
    @DisplayName("원본만 있고 화자별 발화가 없으면 성공 결과로 인정하지 않는다")
    void create_failure_rawOnly() {
        // given
        String raw = "{}";

        // when
        Throwable thrown = catchThrowable(
                () -> new TranscriptResult(
                        1,
                        raw,
                        List.of()
                )
        );

        // then
        assertInvalidResult(thrown);
    }

    @Test
    @DisplayName("역순 시간의 발화는 성공 결과로 인정하지 않는다")
    void createUtterance_failure_reversedTime() {
        // given

        // when
        Throwable thrown = catchThrowable(
                () -> new TranscriptResult.Utterance(
                        0,
                        "화자 1",
                        2,
                        1,
                        "말"
                )
        );

        // then
        assertInvalidResult(thrown);
    }

    @Test
    @DisplayName("원문과 발화는 입력 목록이 바뀌어도 그대로 보존한다")
    void create_success_immutableUtterances() {
        // given
        String raw = "{\"transcription\":[],\"opaque\":\"한글\"}";
        ArrayList<TranscriptResult.Utterance> utterances = new ArrayList<>();
        utterances.add(
                new TranscriptResult.Utterance(
                        0,
                        "화자 1",
                        0,
                        1,
                        "말"
                )
        );

        TranscriptResult result = new TranscriptResult(
                1,
                raw,
                utterances
        );

        // when
        utterances.clear();

        // then
        assertThat(result.rawWhisperJson()).isEqualTo(raw);
        assertThat(result.utterances()).hasSize(1);
    }

    @Test
    @DisplayName("시작 시각이 역순인 결과는 거부한다")
    void create_failure_unorderedUtterances() {
        // given
        List<TranscriptResult.Utterance> utterances = List.of(
                new TranscriptResult.Utterance(
                        0,
                        "화자 1",
                        2,
                        3,
                        "먼저"
                ),
                new TranscriptResult.Utterance(
                        1,
                        "화자 1",
                        0,
                        1,
                        "나중"
                )
        );

        // when
        Throwable thrown = catchThrowable(
                () -> new TranscriptResult(
                        1,
                        "{}",
                        utterances
                )
        );

        // then
        assertInvalidResult(thrown);
    }

    @Test
    @DisplayName("연속되지 않은 발화 순서는 거부한다")
    void create_failure_nonContiguousOrder() {
        // given
        List<TranscriptResult.Utterance> utterances = List.of(
                new TranscriptResult.Utterance(
                        1,
                        "화자 1",
                        0,
                        1,
                        "말"
                )
        );

        // when
        Throwable thrown = catchThrowable(
                () -> new TranscriptResult(
                        1,
                        "{}",
                        utterances
                )
        );

        // then
        assertInvalidResult(thrown);
    }

    @Test
    @DisplayName("누락된 발화는 전사 결과 오류로 거부한다")
    void create_failure_nullUtterance() {
        // given
        List<TranscriptResult.Utterance> utterances = Arrays.asList((TranscriptResult.Utterance) null);

        // when
        Throwable thrown = catchThrowable(
                () -> new TranscriptResult(
                        1,
                        "{}",
                        utterances
                )
        );

        // then
        assertInvalidResult(thrown);
    }

    @Test
    @DisplayName("결과의 발화 목록은 변경할 수 없다")
    void modifyUtterances_failure_immutableList() {
        // given
        TranscriptResult result = new TranscriptResult(
                1,
                "{}",
                validUtterances()
        );

        // when
        Throwable thrown = catchThrowable(
                () -> result.utterances()
                        .clear()
        );

        // then
        assertThat(thrown).isInstanceOf(UnsupportedOperationException.class);
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 2})
    @DisplayName("지원하지 않는 스키마 버전은 거부한다")
    void create_failure_unsupportedSchemaVersion(int schemaVersion) {
        // given
        List<TranscriptResult.Utterance> utterances = validUtterances();

        // when
        Throwable thrown = catchThrowable(
                () -> new TranscriptResult(
                        schemaVersion,
                        "{}",
                        utterances
                )
        );

        // then
        assertInvalidResult(thrown);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" \t\n"})
    @DisplayName("원본 JSON이 없거나 공백이면 거부한다")
    void create_failure_missingRawWhisperJson(String rawWhisperJson) {
        // given
        List<TranscriptResult.Utterance> utterances = validUtterances();

        // when
        Throwable thrown = catchThrowable(
                () -> new TranscriptResult(
                        1,
                        rawWhisperJson,
                        utterances
                )
        );

        // then
        assertInvalidResult(thrown);
    }

    @Test
    @DisplayName("발화 목록이 없으면 거부한다")
    void create_failure_nullUtterances() {
        // given
        List<TranscriptResult.Utterance> utterances = null;

        // when
        Throwable thrown = catchThrowable(
                () -> new TranscriptResult(
                        1,
                        "{}",
                        utterances
                )
        );

        // then
        assertInvalidResult(thrown);
    }

    @ParameterizedTest
    @MethodSource("invalidUtterances")
    @DisplayName("발화의 순서와 시각과 필수 내용이 유효하지 않으면 거부한다")
    void createUtterance_failure_invalidFields(
            int ord,
            String speakerLabel,
            double startSec,
            double endSec,
            String text
    ) {
        // given

        // when
        Throwable thrown = catchThrowable(
                () -> new TranscriptResult.Utterance(
                        ord,
                        speakerLabel,
                        startSec,
                        endSec,
                        text
                )
        );

        // then
        assertInvalidResult(thrown);
    }

    private static Stream<Arguments> invalidUtterances() {
        return Stream.of(
                Arguments.of(
                        -1,
                        "화자 1",
                        0,
                        1,
                        "말"
                ),
                Arguments.of(
                        0,
                        "화자 1",
                        -1,
                        1,
                        "말"
                ),
                Arguments.of(
                        0,
                        "화자 1",
                        0,
                        -1,
                        "말"
                ),
                Arguments.of(
                        0,
                        "화자 1",
                        Double.NaN,
                        1,
                        "말"
                ),
                Arguments.of(
                        0,
                        "화자 1",
                        Double.POSITIVE_INFINITY,
                        1,
                        "말"
                ),
                Arguments.of(
                        0,
                        "화자 1",
                        0,
                        Double.NaN,
                        "말"
                ),
                Arguments.of(
                        0,
                        "화자 1",
                        0,
                        Double.POSITIVE_INFINITY,
                        "말"
                ),
                Arguments.of(
                        0,
                        null,
                        0,
                        1,
                        "말"
                ),
                Arguments.of(
                        0,
                        "",
                        0,
                        1,
                        "말"
                ),
                Arguments.of(
                        0,
                        " \t",
                        0,
                        1,
                        "말"
                ),
                Arguments.of(
                        0,
                        "화자 1",
                        0,
                        1,
                        null
                ),
                Arguments.of(
                        0,
                        "화자 1",
                        0,
                        1,
                        ""
                ),
                Arguments.of(
                        0,
                        "화자 1",
                        0,
                        1,
                        " \n"
                )
        );
    }

    private static List<TranscriptResult.Utterance> validUtterances() {
        return List.of(
                new TranscriptResult.Utterance(
                        0,
                        "화자 1",
                        0,
                        1,
                        "말"
                )
        );
    }

    private static void assertInvalidResult(Throwable thrown) {
        assertThat(thrown).isInstanceOfSatisfying(
                TranscriptionException.class,
                exception -> assertThat(exception.getErrorCode()).isEqualTo(TranscriptionErrorCode.INVALID_RESULT)
        );
    }
}
