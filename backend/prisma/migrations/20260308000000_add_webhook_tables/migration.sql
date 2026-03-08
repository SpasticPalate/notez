-- CreateTable webhooks
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "events" TEXT[] NOT NULL,
    "encrypted_secret" TEXT NOT NULL,
    "secret_expires_at" TIMESTAMP(3),
    "encrypted_previous_secret" TEXT,
    "metadata" JSONB,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable webhook_events
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "entity_type" VARCHAR(20) NOT NULL,
    "entity_id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "previous_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable webhook_deliveries
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "webhook_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "request_headers" JSONB,
    "request_body" TEXT,
    "response_status" INTEGER,
    "response_body" TEXT,
    "response_time_ms" INTEGER,
    "attempt_number" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "next_retry_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "webhooks_user_id_idx" ON "webhooks"("user_id");
CREATE INDEX "webhooks_status_idx" ON "webhooks"("status");
CREATE INDEX "webhook_events_created_at_idx" ON "webhook_events"("created_at");
CREATE INDEX "webhook_events_entity_type_entity_id_idx" ON "webhook_events"("entity_type", "entity_id");
CREATE INDEX "webhook_events_user_id_event_type_idx" ON "webhook_events"("user_id", "event_type");
CREATE INDEX "webhook_deliveries_webhook_id_created_at_idx" ON "webhook_deliveries"("webhook_id", "created_at");
CREATE INDEX "webhook_deliveries_status_next_retry_at_idx" ON "webhook_deliveries"("status", "next_retry_at");

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "webhook_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
