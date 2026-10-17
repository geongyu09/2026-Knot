package com.knot.backend.search.presentation.dto.request;

import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.deser.std.StdScalarDeserializer;

public class SearchQuestionStringDeserializer extends StdScalarDeserializer<String> {

    public SearchQuestionStringDeserializer() {
        super(String.class);
    }

    @Override
    public String deserialize(
            JsonParser parser,
            DeserializationContext context
    ) {
        if (parser.currentToken() != JsonToken.VALUE_STRING) {
            return context.reportInputMismatch(
                    String.class,
                    "질문과 requestId는 JSON 문자열이어야 합니다"
            );
        }
        return parser.getString();
    }
}
