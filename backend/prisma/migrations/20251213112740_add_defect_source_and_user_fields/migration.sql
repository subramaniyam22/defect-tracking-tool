-- CreateEnum
CREATE TYPE "DefectSource" AS ENUM ('PEER_REVIEW', 'PM_FEEDBACK', 'STAGING_QC', 'PRE_LIVE_QC', 'POST_LIVE_QC');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DefectStatus" ADD VALUE 'FIXED';
ALTER TYPE "DefectStatus" ADD VALUE 'DEFERRED';
ALTER TYPE "DefectStatus" ADD VALUE 'OUT_OF_SCOPE';

-- AlterTable
ALTER TABLE "Defect" ADD COLUMN     "source" "DefectSource" NOT NULL DEFAULT 'STAGING_QC';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "email" TEXT,
ADD COLUMN     "fullName" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Defect_source_idx" ON "Defect"("source");
