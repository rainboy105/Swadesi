package org.smartgurukul.swadesi.listing;

import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Public image serving so {@code <img>} tags (which send no auth) can load dish photos. */
@RestController
@RequestMapping("/api/public/listings")
public class ListingPhotoController {

    private final ListingPhotoRepository photos;

    public ListingPhotoController(ListingPhotoRepository photos) {
        this.photos = photos;
    }

    @GetMapping("/{id}/photo")
    public ResponseEntity<byte[]> photo(@PathVariable UUID id) {
        return photos.findById(id)
                .map(p -> ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType(p.getContentType()))
                        .cacheControl(CacheControl.maxAge(java.time.Duration.ofHours(1)).cachePublic())
                        .body(p.getData()))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
