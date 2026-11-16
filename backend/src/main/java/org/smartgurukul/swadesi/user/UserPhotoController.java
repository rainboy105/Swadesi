package org.smartgurukul.swadesi.user;

import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Public serving of user profile photos so {@code <img>} tags can load them without auth. */
@RestController
@RequestMapping("/api/public/users")
public class UserPhotoController {

    private final UserPhotoRepository photos;

    public UserPhotoController(UserPhotoRepository photos) {
        this.photos = photos;
    }

    @GetMapping("/{id}/avatar")
    public ResponseEntity<byte[]> avatar(@PathVariable UUID id) {
        return photos.findById(id)
                .map(p -> ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType(p.getContentType()))
                        .cacheControl(CacheControl.maxAge(java.time.Duration.ofHours(1)).cachePublic())
                        .body(p.getData()))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
