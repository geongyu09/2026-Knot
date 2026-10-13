package com.knot.backend.global.exception;

import jakarta.validation.Valid;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@TestComponent
@RequestMapping("/api/v1/test/http-errors")
class HttpErrorProbeController {

    @GetMapping("/ok")
    String read() {
        return "ok";
    }

    @PostMapping(value = "/json", consumes = MediaType.APPLICATION_JSON_VALUE)
    HttpErrorProbeRequest create(@Valid @RequestBody HttpErrorProbeRequest request) {
        return request;
    }

    @GetMapping("/internal")
    String fail() {
        throw new IllegalStateException("private-server-detail");
    }
}
