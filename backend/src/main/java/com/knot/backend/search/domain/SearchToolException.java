package com.knot.backend.search.domain;

import lombok.Getter;

@Getter
public class SearchToolException extends RuntimeException {

    private final String code;

    public SearchToolException(String code) {
        super(code);
        this.code = code;
    }
}
