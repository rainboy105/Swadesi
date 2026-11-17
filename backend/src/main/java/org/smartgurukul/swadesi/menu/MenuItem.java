package org.smartgurukul.swadesi.menu;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;

/** A dish a cook publishes on their menu; consumers can request it. */
@Entity
@Table(name = "menu_items")
public class MenuItem {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "cook_id", nullable = false)
    private UUID cookId;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "description")
    private String description;

    /** veg | nonveg */
    @Column(name = "food_type", nullable = false)
    private String foodType = "veg";

    /** Indicative price; the binding price is what the cook enters when accepting a request. */
    @Column(name = "price_per_serving")
    private Integer pricePerServing;

    @Column(name = "available", nullable = false)
    private boolean available = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getCookId() { return cookId; }
    public void setCookId(UUID cookId) { this.cookId = cookId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getFoodType() { return foodType; }
    public void setFoodType(String foodType) { this.foodType = foodType; }
    public Integer getPricePerServing() { return pricePerServing; }
    public void setPricePerServing(Integer pricePerServing) { this.pricePerServing = pricePerServing; }
    public boolean isAvailable() { return available; }
    public void setAvailable(boolean available) { this.available = available; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
}
