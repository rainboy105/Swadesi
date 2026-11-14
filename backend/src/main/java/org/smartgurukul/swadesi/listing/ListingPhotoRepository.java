package org.smartgurukul.swadesi.listing;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ListingPhotoRepository extends JpaRepository<ListingPhoto, UUID> {}
