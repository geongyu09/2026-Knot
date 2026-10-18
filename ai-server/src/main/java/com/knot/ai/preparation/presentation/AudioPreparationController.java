package com.knot.ai.preparation.presentation;

import com.knot.ai.preparation.application.AudioPreparationService;
import com.knot.ai.preparation.application.AudioPreparationSnapshot;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.io.IOException;
import java.net.URI;
import java.util.UUID;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/audio-preparations")
public class AudioPreparationController {
    private final AudioPreparationService service;
    public AudioPreparationController(AudioPreparationService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<AudioPreparationSnapshot> create(@Valid @RequestBody CreateRequest request) {
        AudioPreparationSnapshot result = service.create(
                request.attemptId(),
                request.downloadUrl()
        );
        return ResponseEntity.accepted()
                .location(URI.create("/api/v1/audio-preparations/" + result.attemptId()))
                .body(result);
    }

    @GetMapping("/{attemptId}")
    public AudioPreparationSnapshot get(@PathVariable UUID attemptId) {
        return service.get(attemptId);
    }

    @GetMapping("/{attemptId}/audio")
    public ResponseEntity<InputStreamResource> audio(@PathVariable UUID attemptId) throws IOException {
        AudioPreparationService.AudioDownload download = service.audio(attemptId);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("audio/wav"))
                .contentLength(download.byteLength())
                .body(download.resource());
    }

    public record CreateRequest(
            @NotNull UUID attemptId,
            @NotBlank String downloadUrl
    ) {
    }
}
