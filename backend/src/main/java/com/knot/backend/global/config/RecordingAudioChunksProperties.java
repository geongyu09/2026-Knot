package com.knot.backend.global.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "recording.audio-chunks")
public record RecordingAudioChunksProperties(
        boolean enabled,
        boolean incrementalEnabled
) {
    @org.springframework.boot.context.properties.bind.ConstructorBinding
    public RecordingAudioChunksProperties {
    }

    public RecordingAudioChunksProperties(boolean enabled) {
        this(
                enabled,
                false
        );
    }
}
