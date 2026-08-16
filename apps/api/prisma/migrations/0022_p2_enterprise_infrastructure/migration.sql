-- P2 Enterprise Infrastructure
-- Workflow, notifications, document governance, integrations and authorized search.

CREATE TYPE "WorkflowInstanceStatus" AS ENUM ('RUNNING','COMPLETED','REJECTED','CANCELLED','EXPIRED');
CREATE TYPE "WorkflowTaskStatus" AS ENUM ('PENDING','APPROVED','REJECTED','SKIPPED','CANCELLED');
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP','EMAIL','SMS','PUSH','WHATSAPP');
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED','SENT','FAILED','READ','DISMISSED');
CREATE TYPE "DocumentClassification" AS ENUM ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED');
CREATE TYPE "DocumentVerificationStatus" AS ENUM ('UNVERIFIED','VERIFIED','REJECTED','EXPIRED');
CREATE TYPE "SearchDocumentType" AS ENUM ('STUDENT','STAFF','COURSE','PROGRAMME','APPLICATION','DOCUMENT','OTHER');
CREATE TYPE "IntegrationStatus" AS ENUM ('ACTIVE','PAUSED','FAILED','DISABLED');

CREATE TABLE "WorkflowDefinition" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkflowDefinition_code_key" ON "WorkflowDefinition"("code");

CREATE TABLE "WorkflowStep" (
  "id" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "roleCode" TEXT,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkflowStep_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkflowStep_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkflowStep_workflowId_code_key" ON "WorkflowStep"("workflowId","code");
CREATE UNIQUE INDEX "WorkflowStep_workflowId_sequence_key" ON "WorkflowStep"("workflowId","sequence");

CREATE TABLE "WorkflowInstance" (
  "id" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "status" "WorkflowInstanceStatus" NOT NULL DEFAULT 'RUNNING',
  "startedById" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkflowInstance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkflowInstance_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "WorkflowDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "WorkflowInstance_entity_idx" ON "WorkflowInstance"("entityType","entityId");
CREATE INDEX "WorkflowInstance_status_idx" ON "WorkflowInstance"("workflowId","status");

CREATE TABLE "WorkflowTask" (
  "id" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "stepId" TEXT NOT NULL,
  "status" "WorkflowTaskStatus" NOT NULL DEFAULT 'PENDING',
  "assignedToId" TEXT,
  "actedById" TEXT,
  "actedAt" TIMESTAMP(3),
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkflowTask_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkflowTask_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WorkflowInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkflowTask_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "WorkflowStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkflowTask_instanceId_stepId_key" ON "WorkflowTask"("instanceId","stepId");
CREATE INDEX "WorkflowTask_assignee_status_idx" ON "WorkflowTask"("assignedToId","status");

CREATE TABLE "NotificationPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationPreference_userId_channel_key" ON "NotificationPreference"("userId","channel");

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
  "subject" TEXT,
  "body" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Notification_user_status_created_idx" ON "Notification"("userId","status","createdAt");
CREATE INDEX "Notification_entity_idx" ON "Notification"("entityType","entityId");

CREATE TABLE "EnterpriseDocument" (
  "id" TEXT NOT NULL,
  "ownerType" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "classification" "DocumentClassification" NOT NULL DEFAULT 'INTERNAL',
  "fileName" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" BIGINT NOT NULL,
  "checksum" TEXT NOT NULL,
  "verificationStatus" "DocumentVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "verifiedById" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EnterpriseDocument_storageKey_key" ON "EnterpriseDocument"("storageKey");
CREATE INDEX "EnterpriseDocument_owner_idx" ON "EnterpriseDocument"("ownerType","ownerId");
CREATE INDEX "EnterpriseDocument_type_classification_idx" ON "EnterpriseDocument"("documentType","classification");

CREATE TABLE "IntegrationEndpoint" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "baseUrl" TEXT,
  "status" "IntegrationStatus" NOT NULL DEFAULT 'ACTIVE',
  "timeoutMs" INTEGER NOT NULL DEFAULT 10000,
  "retryLimit" INTEGER NOT NULL DEFAULT 3,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationEndpoint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntegrationEndpoint_code_key" ON "IntegrationEndpoint"("code");

CREATE TABLE "IntegrationDelivery" (
  "id" TEXT NOT NULL,
  "endpointId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "status" "IntegrationStatus" NOT NULL DEFAULT 'ACTIVE',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "responseCode" INTEGER,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IntegrationDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "IntegrationEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "IntegrationDelivery_endpointId_eventId_key" ON "IntegrationDelivery"("endpointId","eventId");
CREATE INDEX "IntegrationDelivery_status_nextAttempt_idx" ON "IntegrationDelivery"("status","nextAttemptAt");

CREATE TABLE "SearchIndexEntry" (
  "id" TEXT NOT NULL,
  "documentType" "SearchDocumentType" NOT NULL,
  "documentId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "searchable" TEXT NOT NULL,
  "scopeKey" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SearchIndexEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SearchIndexEntry_documentType_documentId_key" ON "SearchIndexEntry"("documentType","documentId");
CREATE INDEX "SearchIndexEntry_scope_active_idx" ON "SearchIndexEntry"("scopeKey","active");

-- RLS is intentionally enabled only on records where a generic owner/scope boundary exists.
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EnterpriseDocument" ENABLE ROW LEVEL SECURITY;

-- Policies expect the existing request-scoped app.user_id setting.
CREATE POLICY "notification_owner" ON "Notification"
  USING ("userId" = current_setting('app.user_id', true));

CREATE POLICY "notification_preference_owner" ON "NotificationPreference"
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));

-- EnterpriseDocument is protected conservatively: application service must establish
-- scope using ownerId and explicit privileged roles; no permissive public policy is added.
