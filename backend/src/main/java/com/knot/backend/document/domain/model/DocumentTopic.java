package com.knot.backend.document.domain.model;

import com.knot.backend.document.domain.DocumentErrorCode;
import com.knot.backend.document.domain.DocumentException;

import java.text.Normalizer;
import lombok.EqualsAndHashCode;

@EqualsAndHashCode
public final class DocumentTopic {

    private final String value;

    private DocumentTopic(String value) {
        this.value = value;
    }

    public static DocumentTopic of(String value) {
        if (DocumentText.isBlank(value)) {
            throw new DocumentException(DocumentErrorCode.INVALID_DOCUMENT_DATA);
        }
        String normalized = Normalizer.normalize(
                value,
                Normalizer.Form.NFC
        );
        return new DocumentTopic(DocumentText.normalizeWhitespace(normalized));
    }

    public String value() {
        return value;
    }
}
