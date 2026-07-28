-- CreateTable
CREATE TABLE "SessionHygiene" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "cacheRead" INTEGER,
    "cacheCreation" INTEGER,
    "crGenRatio" DOUBLE PRECISION,
    "maxToolResultLen" INTEGER,
    "toolResultSpikes" JSONB,
    "maxTurnContext" INTEGER,
    "maxTurnContextJump" INTEGER,
    "deltaShrank" BOOLEAN,
    "contextSizeSample" INTEGER,
    "sessionResets" INTEGER,
    "contextSlope" DOUBLE PRECISION,
    "contextSamples" INTEGER,

    CONSTRAINT "SessionHygiene_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionHygiene_recordId_key" ON "SessionHygiene"("recordId");

-- AddForeignKey
ALTER TABLE "SessionHygiene" ADD CONSTRAINT "SessionHygiene_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "CommitRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
