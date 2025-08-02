/*
  Warnings:

  - You are about to drop the column `budget` on the `Project` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Project" DROP COLUMN "budget",
ADD COLUMN     "expenseBudget" DOUBLE PRECISION,
ADD COLUMN     "incomeBudget" DOUBLE PRECISION;
