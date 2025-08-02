-- AlterTable
ALTER TABLE "FinanceEntry" ADD COLUMN     "deductions" DOUBLE PRECISION,
ADD COLUMN     "netAmount" DOUBLE PRECISION,
ADD COLUMN     "status" TEXT,
ADD COLUMN     "vatPercentage" DOUBLE PRECISION;
