package org.smartgurukul.swadesi.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** A user's profile photo bytes, kept out of the main user row. */
@Entity
@Table(name = "user_photos")
public class UserPhoto {

    @Id
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @JdbcTypeCode(SqlTypes.BINARY)
    @Column(name = "data", nullable = false)
    private byte[] data;

    @Column(name = "content_type", nullable = false)
    private String contentType;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public byte[] getData() { return data; }
    public void setData(byte[] data) { this.data = data; }
    public String getContentType() { return contentType; }
    public void setContentType(String contentType) { this.contentType = contentType; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
}
