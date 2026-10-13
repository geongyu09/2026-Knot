package com.knot.backend.global.exception;

import org.springframework.context.annotation.Bean;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@TestConfiguration(proxyBeanMethods = false)
@EnableWebMvc
class HttpErrorWebMvcConfiguration implements WebMvcConfigurer {

    @Bean
    HttpErrorProbeController httpErrorProbeController() {
        return new HttpErrorProbeController();
    }

    @Bean
    ObjectMapper objectMapper() {
        return JsonMapper.builder()
                .build();
    }

    @Bean
    ClientRegistrationRepository clientRegistrationRepository() {
        ClientRegistration registration = ClientRegistration.withRegistrationId("github")
                .clientId("test-client")
                .clientSecret("test-secret")
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
                .authorizationUri("https://example.com/authorize")
                .tokenUri("https://example.com/token")
                .userInfoUri("https://example.com/user")
                .userNameAttributeName("id")
                .build();
        return new InMemoryClientRegistrationRepository(registration);
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/assets/**")
                .addResourceLocations("classpath:/http-error-fixture/");
    }
}
