package com.knot.backend.document.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

class DocumentTranscriptTextReaderTest {
    private final DocumentTranscriptTextReader reader = new DocumentTranscriptTextReader();

    @Test
    @DisplayName("Whisper 메타데이터와 토큰을 제외하고 배열 순서대로 발화를 연결한다")
    void read_success_extractsWhisperUtterancesInArrayOrder() {
        // given
        String raw = """
                {"model":{"type":"large-v3"},"params":{"language":"ko"},"result":{"language":"ko"},
                 "transcription":[
                   {"text":" 둘째 시각 발화 ","offsets":{"from":2000,"to":3000},"tokens":[{"text":"제외"}]},
                   {"text":"첫째 시각 발화","offsets":{"from":0,"to":1000}}]}
                """;
        // when
        String result = reader.read(raw);
        // then
        assertThat(result).isEqualTo(" 둘째 시각 발화 \n첫째 시각 발화");
    }

    @Test
    @DisplayName("최소 Whisper 응답도 발화 텍스트로 변환한다")
    void read_success_extractsMinimalWhisperResponse() {
        // given
        String raw = "{\"transcription\":[{\"text\":\"첫째\"},{\"text\":\"둘째\"}]}";
        // when
        String result = reader.read(raw);
        // then
        assertThat(result).isEqualTo("첫째\n둘째");
    }

    @Test
    @DisplayName("정상 발화 사이의 빈 구간과 공백도 그대로 유지한다")
    void read_success_preservesBlankSegments() {
        // given
        String raw = "{\"transcription\":[{\"text\":\"\"},{\"text\":\"정상 발화\"},{\"text\":\"　 \"}]}";
        // when
        String result = reader.read(raw);
        // then
        assertThat(result).isEqualTo("\n정상 발화\n　 ");
    }

    @ParameterizedTest
    @ValueSource(strings = {"{\"transcription\":[]}", "{\"transcription\":[{\"text\":\"\"}]}"})
    @DisplayName("유효한 빈 발화 목록과 빈 문자열 발화는 빈 텍스트로 변환한다")
    void read_success_extractsEmptyUtterances(String raw) {
        // given
        String content = raw;
        // when
        String result = reader.read(content);
        // then
        assertThat(result).isEmpty();
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "  일반 발화\n  ", "{중괄호로 시작하는 발화", " [1, 2] ", " {\"text\":\"발화로 오인하지 않는다\"} ",
            "{\"transcription\":[{\"text\":\"보존\"}],\"meeting\":true}",
            "{\"transcription\":[{\"text\":\"보존\"}],\"model\":\"일반 문자열\",\"params\":{}}",
            "{\"transcription\":[{\"text\":\"보존\"}]} 뒤에 사람이 말한 내용", "{\"transcription\":[{\"text\":\"보존\"}]} {}"})
    @DisplayName("기존 일반 텍스트와 비Whisper JSON 및 JSON처럼 보이는 내용은 공백까지 보존한다")
    void read_success_preservesUnknownContent(String original) {
        // given
        String content = original;
        // when
        String result = reader.read(content);
        // then
        assertThat(result).isEqualTo(original);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{\"transcription\":[{}]}", "{\"transcription\":[null]}", "{\"transcription\":[123]}",
            "{\"transcription\":[{\"text\":\"일부 발화\"},{\"text\":null}]}",
            "{\"transcription\":[{\"text\":\"일부 발화\"},{\"text\":123}]}",
            "{\"model\":{},\"params\":{},\"transcription\":null}",
            "{\"model\":{},\"params\":{},\"transcription\":{\"text\":\"오류\"}}"})
    @DisplayName("지원하지 않는 Whisper 구조는 일부 발화를 추출하지 않고 원문을 보존한다")
    void read_success_preservesUnsupportedWhisperStructure(String raw) {
        // given
        String content = raw;
        // when
        String result = reader.read(content);
        // then
        assertThat(result).isEqualTo(raw);
    }
}
