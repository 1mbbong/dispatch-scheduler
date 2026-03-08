/*
  Warnings:

  - A unique constraint covering the columns `[schedule_id,employee_id,date]` on the table `assignments` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `date` to the `assignments` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "assignments_employee_id_start_time_end_time_idx";

-- DropIndex
DROP INDEX "assignments_schedule_id_employee_id_key";

-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "date" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "department" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "joinYear" INTEGER,
ADD COLUMN     "subTeam" TEXT,
ADD COLUMN     "team" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "schedules" ADD COLUMN     "category_id" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "category_label" TEXT NOT NULL DEFAULT 'Category';

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_tenant_id_name_key" ON "categories"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "assignments_employee_id_date_start_time_end_time_idx" ON "assignments"("employee_id", "date", "start_time", "end_time");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_schedule_id_employee_id_date_key" ON "assignments"("schedule_id", "employee_id", "date");

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
