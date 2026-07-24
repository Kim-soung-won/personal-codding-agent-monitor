-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('CAPTURED', 'SUMMARIZED');

-- CreateEnum
CREATE TYPE "SignalPolarity" AS ENUM ('NEGATIVE', 'POSITIVE');

-- CreateEnum
CREATE TYPE "SignalChannel" AS ENUM ('OUTPUT', 'INPUT');

-- CreateEnum
CREATE TYPE "SignalVerdict" AS ENUM ('CONFIRMED', 'FALSE_POSITIVE');

-- CreateEnum
CREATE TYPE "InvocationRowType" AS ENUM ('ITEM', 'AGGREGATE');

-- CreateEnum
CREATE TYPE "ResourceKind" AS ENUM ('AGENT', 'SKILL', 'MCP', 'TOOL');

-- CreateEnum
CREATE TYPE "FeedbackAxis" AS ENUM ('DELEGATION_FIT', 'REWORK_LOOP', 'TOOL_SCOPING', 'COST', 'REPO_NORMS');

-- CreateEnum
CREATE TYPE "FeedbackVerdict" AS ENUM ('GOOD', 'CONCERN', 'INSUFFICIENT_EVIDENCE');

-- CreateTable
CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "remoteUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "identifier" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommitRecord" (
    "id" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL,
    "commitSubject" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "sessionId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "userId" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheCreationTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DECIMAL(12,6),
    "status" "RecordStatus" NOT NULL DEFAULT 'CAPTURED',
    "summary" TEXT,
    "costNote" TEXT,
    "rawMarkdown" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommitRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordAgent" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "plugin" TEXT,
    "agent" TEXT NOT NULL,
    "spawnCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RecordAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "polarity" "SignalPolarity" NOT NULL,
    "channel" "SignalChannel" NOT NULL,
    "verdict" "SignalVerdict" NOT NULL,
    "turnRef" TEXT,
    "excerpt" TEXT,
    "note" TEXT,
    "flaggedCount" INTEGER,
    "confirmedCount" INTEGER,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolInvocation" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "seq" INTEGER,
    "rowType" "InvocationRowType" NOT NULL DEFAULT 'ITEM',
    "actor" TEXT NOT NULL,
    "kind" "ResourceKind",
    "resource" TEXT NOT NULL,
    "plugin" TEXT,
    "target" TEXT,
    "note" TEXT,
    "isError" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ToolInvocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackItem" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "axis" "FeedbackAxis" NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "verdict" "FeedbackVerdict",

    CONSTRAINT "FeedbackItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_path_key" ON "Project"("path");

-- CreateIndex
CREATE INDEX "Project_name_idx" ON "Project"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_identifier_key" ON "User"("identifier");

-- CreateIndex
CREATE INDEX "CommitRecord_sessionId_idx" ON "CommitRecord"("sessionId");

-- CreateIndex
CREATE INDEX "CommitRecord_capturedAt_idx" ON "CommitRecord"("capturedAt");

-- CreateIndex
CREATE INDEX "CommitRecord_projectId_capturedAt_idx" ON "CommitRecord"("projectId", "capturedAt");

-- CreateIndex
CREATE INDEX "CommitRecord_status_idx" ON "CommitRecord"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CommitRecord_projectId_commitSha_revision_key" ON "CommitRecord"("projectId", "commitSha", "revision");

-- CreateIndex
CREATE INDEX "RecordAgent_agent_idx" ON "RecordAgent"("agent");

-- CreateIndex
CREATE INDEX "RecordAgent_plugin_idx" ON "RecordAgent"("plugin");

-- CreateIndex
CREATE UNIQUE INDEX "RecordAgent_recordId_plugin_agent_key" ON "RecordAgent"("recordId", "plugin", "agent");

-- CreateIndex
CREATE INDEX "Signal_recordId_idx" ON "Signal"("recordId");

-- CreateIndex
CREATE INDEX "Signal_polarity_verdict_idx" ON "Signal"("polarity", "verdict");

-- CreateIndex
CREATE INDEX "ToolInvocation_recordId_seq_idx" ON "ToolInvocation"("recordId", "seq");

-- CreateIndex
CREATE INDEX "ToolInvocation_kind_resource_idx" ON "ToolInvocation"("kind", "resource");

-- CreateIndex
CREATE INDEX "ToolInvocation_isError_idx" ON "ToolInvocation"("isError");

-- CreateIndex
CREATE INDEX "FeedbackItem_axis_verdict_idx" ON "FeedbackItem"("axis", "verdict");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackItem_recordId_axis_key" ON "FeedbackItem"("recordId", "axis");

-- AddForeignKey
ALTER TABLE "CommitRecord" ADD CONSTRAINT "CommitRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitRecord" ADD CONSTRAINT "CommitRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordAgent" ADD CONSTRAINT "RecordAgent_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "CommitRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "CommitRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolInvocation" ADD CONSTRAINT "ToolInvocation_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "CommitRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackItem" ADD CONSTRAINT "FeedbackItem_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "CommitRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

