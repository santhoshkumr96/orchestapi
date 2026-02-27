# ============================================================
# OrchestAPI — Multi-stage Production Dockerfile
# Builds frontend + backend into a single image
# ============================================================

# ── Stage 1: Build Frontend ──────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --prefer-offline
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Build Backend ───────────────────────────────────
FROM maven:3.9-eclipse-temurin-21 AS backend-build
WORKDIR /app/backend

# Cache Maven dependencies first (layer caching)
COPY backend/pom.xml ./
RUN mvn dependency:go-offline -B

# Copy source code
COPY backend/src ./src/

# Copy frontend build output into Spring Boot static resources
COPY --from=frontend-build /app/frontend/dist ./src/main/resources/static/

# Build the JAR (skip tests — they need a running DB)
RUN mvn clean package -DskipTests -B

# ── Stage 3: Production Runtime ──────────────────────────────
FROM eclipse-temurin:21-jre-alpine AS runtime

# Add non-root user for security
RUN addgroup -S orchestapi && adduser -S orchestapi -G orchestapi

WORKDIR /app

# Copy the built JAR
COPY --from=backend-build /app/backend/target/orchestapi-1.0.0.jar app.jar

# Switch to non-root user
USER orchestapi

# Expose the default port
EXPOSE 8080

# Health check using Spring Actuator
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q --spider http://localhost:8080/actuator/health || exit 1

# JVM tuning for containers
ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0"

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
