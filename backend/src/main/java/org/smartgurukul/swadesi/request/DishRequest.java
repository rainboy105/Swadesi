package org.smartgurukul.swadesi.request;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;

/** A consumer's request to a specific cook to make a dish (name + servings). */
@Entity
@Table(name = "dish_requests")
public class DishRequest {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "consumer_id", nullable = false)
    private UUID consumerId;

    @Column(name = "consumer_name")
    private String consumerName;

    @Column(name = "consumer_phone")
    private String consumerPhone;

    @Column(name = "cook_id", nullable = false)
    private UUID cookId;

    @Column(name = "cook_name")
    private String cookName;

    @Column(name = "dish_name", nullable = false)
    private String dishName;

    @Column(name = "qty", nullable = false)
    private int qty;

    @Column(name = "note")
    private String note;

    /** pending | accepted | rejected | cancelled | fulfilled */
    @Column(name = "status", nullable = false)
    private String status = "pending";

    @Column(name = "price_per_serving")
    private Integer pricePerServing;

    /** The one-off listing created when the cook accepts (what the consumer pays against). */
    @Column(name = "listing_id")
    private UUID listingId;

    /** The order created once the consumer has paid. */
    @Column(name = "order_id")
    private UUID orderId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getConsumerId() { return consumerId; }
    public void setConsumerId(UUID consumerId) { this.consumerId = consumerId; }
    public String getConsumerName() { return consumerName; }
    public void setConsumerName(String consumerName) { this.consumerName = consumerName; }
    public String getConsumerPhone() { return consumerPhone; }
    public void setConsumerPhone(String consumerPhone) { this.consumerPhone = consumerPhone; }
    public UUID getCookId() { return cookId; }
    public void setCookId(UUID cookId) { this.cookId = cookId; }
    public String getCookName() { return cookName; }
    public void setCookName(String cookName) { this.cookName = cookName; }
    public String getDishName() { return dishName; }
    public void setDishName(String dishName) { this.dishName = dishName; }
    public int getQty() { return qty; }
    public void setQty(int qty) { this.qty = qty; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Integer getPricePerServing() { return pricePerServing; }
    public void setPricePerServing(Integer pricePerServing) { this.pricePerServing = pricePerServing; }
    public UUID getListingId() { return listingId; }
    public void setListingId(UUID listingId) { this.listingId = listingId; }
    public UUID getOrderId() { return orderId; }
    public void setOrderId(UUID orderId) { this.orderId = orderId; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
}
