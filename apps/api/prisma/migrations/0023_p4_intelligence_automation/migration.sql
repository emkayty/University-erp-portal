-- P4 Intelligence & Automation
CREATE TYPE "RuleStatus" AS ENUM ('DRAFT','ACTIVE','PAUSED','RETIRED');
CREATE TYPE "RuleActionType" AS ENUM ('NOTIFY','CREATE_TASK','FLAG','REQUEST_REVIEW','ESCALATE');
CREATE TYPE "AlertSeverity" AS ENUM ('INFO','WARNING','CRITICAL');
CREATE TYPE "AlertStatus" AS ENUM ('OPEN','ACKNOWLEDGED','RESOLVED','DISMISSED');

CREATE TABLE "BusinessRule" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "domain" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "RuleStatus" NOT NULL DEFAULT 'DRAFT',
  "condition" JSONB NOT NULL,
  "actions" JSONB NOT NULL,
  "createdById" TEXT,
  "approvedById" TEXT,
  "activatedAt" TIMESTAMP(3),
  "retiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BusinessRule_code_key" ON "BusinessRule"("code");
CREATE INDEX "BusinessRule_domain_status_idx" ON "BusinessRule"("domain","status");

CREATE TABLE "RuleExecution" (
  "id" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "actionResult" JSONB,
  "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RuleExecution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RuleExecution_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "BusinessRule"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RuleExecution_rule_executed_idx" ON "RuleExecution"("ruleId","executedAt");
CREATE INDEX "RuleExecution_entity_executed_idx" ON "RuleExecution"("entityType","entityId","executedAt");

CREATE TABLE "EnterpriseAlert" (
  "id" TEXT NOT NULL,
  "severity" "AlertSeverity" NOT NULL,
  "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
  "domain" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "assignedToId" TEXT,
  "acknowledgedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseAlert_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EnterpriseAlert_status_severity_created_idx" ON "EnterpriseAlert"("status","severity","createdAt");
CREATE INDEX "EnterpriseAlert_domain_status_idx" ON "EnterpriseAlert"("domain","status");
CREATE INDEX "EnterpriseAlert_entity_idx" ON "EnterpriseAlert"("entityType","entityId");

CREATE TABLE "AutomationTask" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "domain" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "assignedToId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AutomationTask_assignee_status_due_idx" ON "AutomationTask"("assignedToId","status","dueAt");
CREATE INDEX "AutomationTask_domain_status_idx" ON "AutomationTask"("domain","status");
