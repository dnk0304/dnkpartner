-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_MATCH', 'GO_LIVE', 'NEW_BID', 'STATUS_CHANGE', 'SUSPENDED', 'RESUMED', 'ENDING_SOON', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('email', 'push', 'inapp');

-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('PROXIMA_APERTURA', 'CELEBRANDOSE', 'SUSPENDIDA', 'CANCELADA', 'CONCLUIDA_PORTAL', 'FINALIZADA_AUTORIDAD', 'PRE_AUCTION', 'ACTIVE', 'FINISHED', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UserTier" AS ENUM ('FREE', 'GOLD', 'DIAMOND');

-- CreateTable
CREATE TABLE "Auction" (
    "id" TEXT NOT NULL,
    "boeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "municipality" TEXT,
    "status" "AuctionStatus" NOT NULL DEFAULT 'CELEBRANDOSE',
    "auctionType" TEXT DEFAULT 'JUDICIAL',
    "appraisalValue" DOUBLE PRECISION NOT NULL,
    "currentBid" DOUBLE PRECISION,
    "minimumBid" DOUBLE PRECISION,
    "depositAmount" DOUBLE PRECISION,
    "claimedAmount" DOUBLE PRECISION,
    "finalBid" DOUBLE PRECISION,
    "bidIncrement" DOUBLE PRECISION,
    "courtName" TEXT,
    "procedureNumber" TEXT,
    "boeLink" TEXT,
    "auctionId" TEXT,
    "lotNumber" TEXT,
    "boeAnnouncement" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "endDateTime" TIMESTAMP(3),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "address" TEXT,
    "propertyType" TEXT,
    "lotDescription" TEXT,
    "propertyDescription" TEXT,
    "charges" TEXT,
    "chargesDetail" TEXT,
    "possessionStatus" TEXT,
    "visitable" TEXT,
    "cadastralRef" TEXT,
    "cadastralData" TEXT,
    "registryId" TEXT,
    "registryInfo" TEXT,
    "contactInfo" TEXT,
    "pdfUrl" TEXT,
    "imageUrl" TEXT,
    "source" TEXT NOT NULL DEFAULT 'BOE',
    "courtReference" TEXT,
    "edictUrl" TEXT,
    "originalSource" TEXT,
    "transitionedAt" TIMESTAMP(3),
    "mapUrl" TEXT,
    "streetViewUrl" TEXT,
    "placeUrl" TEXT,
    "directionsUrl" TEXT,
    "suspensionReason" TEXT,
    "resumeAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "favoriteCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "tier" "UserTier" NOT NULL DEFAULT 'FREE',
    "trialStartDate" TIMESTAMP(3),
    "trialEndDate" TIMESTAMP(3),
    "hasUsedTrial" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "source" TEXT,
    "propertyType" TEXT,
    "province" TEXT,
    "municipality" TEXT,
    "auctionType" TEXT,
    "statuses" TEXT,
    "keywords" TEXT,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT,
    "minPrice" DOUBLE PRECISION,
    "maxPrice" DOUBLE PRECISION,
    "notificationType" TEXT NOT NULL DEFAULT 'grouped',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "status" TEXT NOT NULL,
    "tier" "UserTier" NOT NULL,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "notes" TEXT,
    "notifyOnGoLive" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnBid" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnStatus" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnSuspension" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnResume" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnFinish" BOOLEAN NOT NULL DEFAULT true,
    "channels" TEXT NOT NULL DEFAULT 'email,inapp',
    "quietHoursStart" INTEGER,
    "quietHoursEnd" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "alertId" TEXT,
    "auctionId" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "type" "NotificationType" NOT NULL DEFAULT 'NEW_MATCH',
    "channel" "NotificationChannel" NOT NULL DEFAULT 'inapp',
    "payload" JSONB,
    "deliveredAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionStatusHistory" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "fromStatus" "AuctionStatus",
    "toStatus" "AuctionStatus" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'scraper',
    "reason" TEXT,
    "resumeAt" TIMESTAMP(3),
    "detectedBy" TEXT,

    CONSTRAINT "AuctionStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionBidHistory" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "bid" DOUBLE PRECISION NOT NULL,
    "bidType" TEXT NOT NULL DEFAULT 'current',
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'scraper',

    CONSTRAINT "AuctionBidHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_outbox" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "dedupeKey" TEXT,

    CONSTRAINT "event_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Auction_boeId_key" ON "Auction"("boeId");

-- CreateIndex
CREATE INDEX "Auction_province_idx" ON "Auction"("province");

-- CreateIndex
CREATE INDEX "Auction_status_idx" ON "Auction"("status");

-- CreateIndex
CREATE INDEX "Auction_publishedAt_idx" ON "Auction"("publishedAt");

-- CreateIndex
CREATE INDEX "Auction_source_idx" ON "Auction"("source");

-- CreateIndex
CREATE INDEX "Auction_propertyType_idx" ON "Auction"("propertyType");

-- CreateIndex
CREATE INDEX "Auction_municipality_idx" ON "Auction"("municipality");

-- CreateIndex
CREATE INDEX "Auction_status_endsAt_idx" ON "Auction"("status", "endsAt");

-- CreateIndex
CREATE INDEX "Auction_endsAt_idx" ON "Auction"("endsAt");

-- CreateIndex
CREATE INDEX "Auction_municipality_status_idx" ON "Auction"("municipality", "status");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Alert_userId_idx" ON "Alert"("userId");

-- CreateIndex
CREATE INDEX "Alert_active_idx" ON "Alert"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeCustomerId_key" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_stripeCustomerId_idx" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "Subscription_stripeSubscriptionId_idx" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_email_idx" ON "PasswordResetToken"("email");

-- CreateIndex
CREATE INDEX "Favorite_userId_idx" ON "Favorite"("userId");

-- CreateIndex
CREATE INDEX "Favorite_auctionId_idx" ON "Favorite"("auctionId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_auctionId_key" ON "Favorite"("userId", "auctionId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_alertId_idx" ON "Notification"("alertId");

-- CreateIndex
CREATE INDEX "Notification_auctionId_idx" ON "Notification"("auctionId");

-- CreateIndex
CREATE INDEX "Notification_read_idx" ON "Notification"("read");

-- CreateIndex
CREATE INDEX "Notification_userId_read_sentAt_idx" ON "Notification"("userId", "read", "sentAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "AuctionStatusHistory_auctionId_idx" ON "AuctionStatusHistory"("auctionId");

-- CreateIndex
CREATE INDEX "AuctionStatusHistory_changedAt_idx" ON "AuctionStatusHistory"("changedAt");

-- CreateIndex
CREATE INDEX "AuctionStatusHistory_auctionId_changedAt_idx" ON "AuctionStatusHistory"("auctionId", "changedAt" DESC);

-- CreateIndex
CREATE INDEX "AuctionBidHistory_auctionId_idx" ON "AuctionBidHistory"("auctionId");

-- CreateIndex
CREATE INDEX "AuctionBidHistory_seenAt_idx" ON "AuctionBidHistory"("seenAt");

-- CreateIndex
CREATE INDEX "AuctionBidHistory_auctionId_seenAt_idx" ON "AuctionBidHistory"("auctionId", "seenAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "event_outbox_dedupeKey_key" ON "event_outbox"("dedupeKey");

-- CreateIndex
CREATE INDEX "event_outbox_auctionId_idx" ON "event_outbox"("auctionId");

-- CreateIndex
CREATE INDEX "event_outbox_eventType_idx" ON "event_outbox"("eventType");

-- CreateIndex
CREATE INDEX "event_outbox_createdAt_idx" ON "event_outbox"("createdAt");

-- CreateIndex
CREATE INDEX "event_outbox_processedAt_createdAt_idx" ON "event_outbox"("processedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionStatusHistory" ADD CONSTRAINT "AuctionStatusHistory_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionBidHistory" ADD CONSTRAINT "AuctionBidHistory_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_outbox" ADD CONSTRAINT "event_outbox_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
