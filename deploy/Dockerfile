# Multi-stage build for KeldurbenHub Server
FROM rust:1.75-slim as builder

# Install system dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy Cargo files
COPY ../server/Cargo.toml ../server/Cargo.lock ./

# Create dummy main.rs to cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs && echo "pub struct AuthService;" > src/auth.rs

# Build dependencies (this layer will be cached)
RUN cargo build --release && rm -rf src

# Copy source code
COPY ../server/src ./src

# Build the actual application
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -r -s /bin/false keldurben

# Set working directory
WORKDIR /app

# Copy binary from builder stage
COPY --from=builder /app/target/release/server /app/server

# Copy frontend files
COPY ../frontend /app/frontend

# Create data directory
RUN mkdir -p /app/data && chown -R keldurben:keldurben /app

# Switch to non-root user
USER keldurben

# Expose port
EXPOSE 8765

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8765/api/auth/me || exit 1

# Set environment variables
ENV RUST_LOG=info
ENV JWT_SECRET=your-production-secret-key-change-this

# Run the server
CMD ["./server"]
