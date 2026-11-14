package org.smartgurukul.swadesi.order;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;

/** A consumer's order for N servings of a listing. */
@Entity
@Table(name = "orders")
public class FoodOrder {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "listing_id", nullable = false)
    private UUID listingId;

    @Column(name = "consumer_id", nullable = false)
    private UUID consumerId;

    @Column(name = "consumer_name")
    private String consumerName;

    @Column(name = "consumer_phone")
    private String consumerPhone;

    @Column(name = "qty", nullable = false)
    private int qty;

    @Column(name = "status", nullable = false)
    private String status = "requested";

    /** The code the consumer shows the cook at pickup. */
    @Column(name = "pickup_code")
    private String pickupCode;

    @Column(name = "razorpay_order_id")
    private String razorpayOrderId;

    @Column(name = "razorpay_payment_id")
    private String razorpayPaymentId;

    @Column(name = "amount_paise")
    private Integer amountPaise;

    @Column(name = "paid", nullable = false)
    private boolean paid = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getListingId() { return listingId; }
    public void setListingId(UUID listingId) { this.listingId = listingId; }
    public UUID getConsumerId() { return consumerId; }
    public void setConsumerId(UUID consumerId) { this.consumerId = consumerId; }
    public String getConsumerName() { return consumerName; }
    public void setConsumerName(String consumerName) { this.consumerName = consumerName; }
    public String getConsumerPhone() { return consumerPhone; }
    public void setConsumerPhone(String consumerPhone) { this.consumerPhone = consumerPhone; }
    public int getQty() { return qty; }
    public void setQty(int qty) { this.qty = qty; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getPickupCode() { return pickupCode; }
    public void setPickupCode(String pickupCode) { this.pickupCode = pickupCode; }
    public String getRazorpayOrderId() { return razorpayOrderId; }
    public void setRazorpayOrderId(String v) { this.razorpayOrderId = v; }
    public String getRazorpayPaymentId() { return razorpayPaymentId; }
    public void setRazorpayPaymentId(String v) { this.razorpayPaymentId = v; }
    public Integer getAmountPaise() { return amountPaise; }
    public void setAmountPaise(Integer v) { this.amountPaise = v; }
    public boolean isPaid() { return paid; }
    public void setPaid(boolean paid) { this.paid = paid; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
}
