package com.knot.ai;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class KnotAiApplication {

    public static void main(String[] args) {
        SpringApplication.run(
                KnotAiApplication.class,
                args
        );
    }
}
