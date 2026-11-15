package org.smartgurukul.swadesi;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class SwadesiApplication {

    public static void main(String[] args) {
        SpringApplication.run(SwadesiApplication.class, args);
    }
}
