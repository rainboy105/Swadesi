package org.smartgurukul.swadesi;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SwadesiApplicationTests {

    @LocalServerPort
    int port;

    @Autowired
    TestRestTemplate rest;

    @Test
    void pingIsPublic() {
        String body = rest.getForObject("http://localhost:" + port + "/api/public/ping", String.class);
        assertThat(body).contains("swadesi");
    }

    @Test
    void unknownEndpointsRequireAuth() {
        var response = rest.getForEntity("http://localhost:" + port + "/api/anything", String.class);
        assertThat(response.getStatusCode().value()).isIn(401, 403);
    }
}
