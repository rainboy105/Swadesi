package org.smartgurukul.swadesi.listing;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;

/** A dish a cook is offering, with a serving cap. */
@Entity
@Table(name = "listings")
public class Listing {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "cook_id", nullable = false)
    private UUID cookId;

    @Column(name = "cook_name")
    private String cookName;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "description")
    private String description;

    @Column(name = "price_per_serving", nullable = false)
    private int pricePerServing;

    @Column(name = "max_servings", nullable = false)
    private int maxServings;

    @Column(name = "servings_claimed", nullable = false)
    private int servingsClaimed = 0;

    @Column(name = "ready_by")
    private OffsetDateTime readyBy;

    /** Orders are accepted only until this time (null = no cutoff). */
    @Column(name = "order_by")
    private OffsetDateTime orderBy;

    /** Opening time: before this the dish is hidden from the feed. Null = open immediately. */
    @Column(name = "available_from")
    private OffsetDateTime availableFrom;

    @Column(name = "status", nullable = false)
    private String status = "open";

    /** "veg" or "nonveg". */
    @Column(name = "food_type", nullable = false)
    private String foodType = "veg";

    /** True for a one-off listing created to fulfil a dish request; hidden from the public feed. */
    @Column(name = "request_only", nullable = false)
    private boolean requestOnly = false;

    @Column(name = "has_photo", nullable = false)
    private boolean hasPhoto = false;

    @Column(name = "lat", nullable = false)
    private double lat;

    @Column(name = "lng", nullable = false)
    private double lng;

    /** Human-readable pickup address for this dish (lat/lng above are the pickup point). */
    @Column(name = "pickup_address")
    private String pickupAddress;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    public int remaining() {
        return Math.max(0, maxServings - servingsClaimed);
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getCookId() { return cookId; }
    public void setCookId(UUID cookId) { this.cookId = cookId; }
    public String getCookName() { return cookName; }
    public void setCookName(String cookName) { this.cookName = cookName; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public int getPricePerServing() { return pricePerServing; }
    public void setPricePerServing(int pricePerServing) { this.pricePerServing = pricePerServing; }
    public int getMaxServings() { return maxServings; }
    public void setMaxServings(int maxServings) { this.maxServings = maxServings; }
    public int getServingsClaimed() { return servingsClaimed; }
    public void setServingsClaimed(int servingsClaimed) { this.servingsClaimed = servingsClaimed; }
    public OffsetDateTime getReadyBy() { return readyBy; }
    public void setReadyBy(OffsetDateTime readyBy) { this.readyBy = readyBy; }
    public OffsetDateTime getOrderBy() { return orderBy; }
    public void setOrderBy(OffsetDateTime orderBy) { this.orderBy = orderBy; }
    public OffsetDateTime getAvailableFrom() { return availableFrom; }
    public void setAvailableFrom(OffsetDateTime availableFrom) { this.availableFrom = availableFrom; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getFoodType() { return foodType; }
    public void setFoodType(String foodType) { this.foodType = foodType; }
    public boolean isRequestOnly() { return requestOnly; }
    public void setRequestOnly(boolean requestOnly) { this.requestOnly = requestOnly; }
    public boolean isHasPhoto() { return hasPhoto; }
    public void setHasPhoto(boolean hasPhoto) { this.hasPhoto = hasPhoto; }
    public double getLat() { return lat; }
    public void setLat(double lat) { this.lat = lat; }
    public double getLng() { return lng; }
    public void setLng(double lng) { this.lng = lng; }
    public String getPickupAddress() { return pickupAddress; }
    public void setPickupAddress(String pickupAddress) { this.pickupAddress = pickupAddress; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
}
