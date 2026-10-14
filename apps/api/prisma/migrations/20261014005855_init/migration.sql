-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('ADMIN', 'FINANCE', 'SSD', 'VP', 'NSM', 'SM', 'RSRM', 'SS', 'RSR', 'AS', 'SUPPORT');

-- CreateEnum
CREATE TYPE "PersonStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'RESIGNED');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('EU', 'DL', 'DR', 'TB', 'RM');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('AS_GENERATED', 'SS_GENERATED', 'IN_HOUSE');

-- CreateEnum
CREATE TYPE "TermBucket" AS ENUM ('COD', 'D30', 'D60', 'D90', 'D120', 'D120_PLUS');

-- CreateEnum
CREATE TYPE "PricingType" AS ENUM ('STANDARD', 'NON_STANDARD');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('LUBE', 'CHEMICAL');

-- CreateEnum
CREATE TYPE "RateTableType" AS ENUM ('VOLUME', 'PRICE');

-- CreateEnum
CREATE TYPE "RateKind" AS ENUM ('RATE', 'FORFEIT');

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('SALES', 'COLLECTIONS');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'VALIDATING', 'VALIDATED', 'FAILED', 'COMMITTED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "CollectionStatus" AS ENUM ('CLEARED', 'PENDING', 'BOUNCED');

-- CreateEnum
CREATE TYPE "RunType" AS ENUM ('AS_WEEKLY', 'SP_MONTHLY');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'COMPUTING', 'FAILED', 'DRAFT', 'SUBMITTED', 'APPROVED', 'LOCKED');

-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('PENDING_COLLECTION', 'COMPUTED', 'EXCEPTION');

-- CreateEnum
CREATE TYPE "ComponentType" AS ENUM ('VOLUME', 'PRICE');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('OPEN', 'RESOLVED', 'WAIVED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "personId" UUID,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "code" "RoleCode" NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" UUID NOT NULL,
    "roleCode" "RoleCode" NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleCode")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "RoleCode" NOT NULL,
    "managerId" UUID,
    "status" "PersonStatus" NOT NULL DEFAULT 'ACTIVE',
    "email" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "eric6Code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "accountType" "AccountType" NOT NULL,
    "asId" UUID,
    "ssId" UUID,
    "smId" UUID,
    "hasCIS" BOOLEAN NOT NULL DEFAULT false,
    "hasCAS" BOOLEAN NOT NULL DEFAULT false,
    "casCosignedBySM" BOOLEAN NOT NULL DEFAULT false,
    "lastOrderDate" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "eric6Code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "litersPerUnit" DECIMAL(18,4) NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pricelist" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pricelist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricelistItem" (
    "id" UUID NOT NULL,
    "pricelistId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "price" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "PricelistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateTable" (
    "id" UUID NOT NULL,
    "type" "RateTableType" NOT NULL,
    "name" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateEntry" (
    "id" UUID NOT NULL,
    "rateTableId" UUID NOT NULL,
    "channel" "Channel",
    "pricingType" "PricingType",
    "termBucket" "TermBucket" NOT NULL,
    "kind" "RateKind" NOT NULL DEFAULT 'RATE',
    "rate" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "RateEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngineSetting" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "isConfidential" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngineSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportMapping" (
    "id" UUID NOT NULL,
    "importType" "ImportType" NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" UUID NOT NULL,
    "type" "ImportType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mappingId" UUID,
    "uploadedById" UUID NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "validCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "rowNo" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "parsed" JSONB,
    "errors" JSONB,
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInvoiceLine" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "customerId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "channel" "Channel" NOT NULL,
    "accountType" "AccountType" NOT NULL,
    "statedTermDays" INTEGER NOT NULL,
    "qty" DECIMAL(18,4) NOT NULL,
    "liters" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "pricelistPrice" DECIMAL(18,4),
    "approvedStandardDiscount" BOOLEAN NOT NULL DEFAULT false,
    "invoiceTotal" DECIMAL(18,4),
    "asId" UUID,
    "ssId" UUID,
    "smId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "checkNo" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(18,4) NOT NULL,
    "status" "CollectionStatus" NOT NULL,
    "paymentDate" DATE,
    "clearedDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComputeRun" (
    "id" UUID NOT NULL,
    "runType" "RunType" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "rulesetSnapshot" JSONB,
    "rulesetHash" TEXT NOT NULL DEFAULT '',
    "engineVersion" TEXT NOT NULL DEFAULT '',
    "totals" JSONB,
    "error" TEXT,
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedById" UUID,
    "submittedAt" TIMESTAMP(3),
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "lockedById" UUID,
    "lockedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComputeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComputeResultLine" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "salesInvoiceLineId" UUID NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "status" "ResultStatus" NOT NULL,
    "recognitionDate" DATE,
    "actualDays" INTEGER,
    "termBucket" "TermBucket",
    "pricingType" "PricingType",
    "collectedAmount" DECIMAL(18,4) NOT NULL,
    "invoiceTotal" DECIMAL(18,4) NOT NULL,
    "totalAmount" DECIMAL(18,4) NOT NULL,
    "exceptions" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "ComputeResultLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionComponent" (
    "id" UUID NOT NULL,
    "resultLineId" UUID NOT NULL,
    "type" "ComponentType" NOT NULL,
    "payeeRole" "RoleCode" NOT NULL,
    "payeeId" UUID NOT NULL,
    "basis" DECIMAL(18,4) NOT NULL,
    "rate" DECIMAL(18,4) NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "rateEntryId" TEXT,
    "explanation" TEXT NOT NULL,
    "internalNotes" TEXT,

    CONSTRAINT "CommissionComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExceptionItem" (
    "id" UUID NOT NULL,
    "runId" UUID,
    "resultLineId" UUID,
    "importBatchId" UUID,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "invoiceNo" TEXT,
    "lineNo" INTEGER,
    "status" "ExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExceptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesBond" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "entryDate" DATE NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesBond_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Penalty" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "entryDate" DATE NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Penalty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TPArrangement" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "terms" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TPArrangement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VouchFund" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "entryDate" DATE NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VouchFund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_personId_key" ON "User"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "Person_code_key" ON "Person"("code");

-- CreateIndex
CREATE INDEX "Person_role_idx" ON "Person"("role");

-- CreateIndex
CREATE INDEX "Person_managerId_idx" ON "Person"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_eric6Code_key" ON "Customer"("eric6Code");

-- CreateIndex
CREATE INDEX "Customer_asId_idx" ON "Customer"("asId");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_eric6Code_key" ON "Product"("eric6Code");

-- CreateIndex
CREATE INDEX "Pricelist_effectiveFrom_effectiveTo_idx" ON "Pricelist"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "PricelistItem_pricelistId_productId_key" ON "PricelistItem"("pricelistId", "productId");

-- CreateIndex
CREATE INDEX "RateTable_type_effectiveFrom_idx" ON "RateTable"("type", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "RateEntry_rateTableId_channel_pricingType_termBucket_key" ON "RateEntry"("rateTableId", "channel", "pricingType", "termBucket");

-- CreateIndex
CREATE UNIQUE INDEX "EngineSetting_key_effectiveFrom_key" ON "EngineSetting"("key", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ImportMapping_importType_name_key" ON "ImportMapping"("importType", "name");

-- CreateIndex
CREATE INDEX "ImportBatch_type_createdAt_idx" ON "ImportBatch"("type", "createdAt");

-- CreateIndex
CREATE INDEX "ImportBatch_fileHash_idx" ON "ImportBatch"("fileHash");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRow_batchId_rowNo_key" ON "ImportRow"("batchId", "rowNo");

-- CreateIndex
CREATE INDEX "SalesInvoiceLine_invoiceNo_idx" ON "SalesInvoiceLine"("invoiceNo");

-- CreateIndex
CREATE INDEX "SalesInvoiceLine_invoiceDate_idx" ON "SalesInvoiceLine"("invoiceDate");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoiceLine_invoiceNo_lineNo_key" ON "SalesInvoiceLine"("invoiceNo", "lineNo");

-- CreateIndex
CREATE INDEX "Collection_invoiceNo_idx" ON "Collection"("invoiceNo");

-- CreateIndex
CREATE INDEX "Collection_clearedDate_idx" ON "Collection"("clearedDate");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_invoiceNo_reference_checkNo_key" ON "Collection"("invoiceNo", "reference", "checkNo");

-- CreateIndex
CREATE INDEX "ComputeRun_runType_periodStart_periodEnd_idx" ON "ComputeRun"("runType", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "ComputeRun_status_idx" ON "ComputeRun"("status");

-- CreateIndex
CREATE INDEX "ComputeResultLine_runId_status_idx" ON "ComputeResultLine"("runId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ComputeResultLine_runId_salesInvoiceLineId_key" ON "ComputeResultLine"("runId", "salesInvoiceLineId");

-- CreateIndex
CREATE INDEX "CommissionComponent_resultLineId_idx" ON "CommissionComponent"("resultLineId");

-- CreateIndex
CREATE INDEX "CommissionComponent_payeeId_idx" ON "CommissionComponent"("payeeId");

-- CreateIndex
CREATE INDEX "ExceptionItem_status_code_idx" ON "ExceptionItem"("status", "code");

-- CreateIndex
CREATE INDEX "ExceptionItem_runId_idx" ON "ExceptionItem"("runId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleCode_fkey" FOREIGN KEY ("roleCode") REFERENCES "Role"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_asId_fkey" FOREIGN KEY ("asId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_ssId_fkey" FOREIGN KEY ("ssId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_smId_fkey" FOREIGN KEY ("smId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricelistItem" ADD CONSTRAINT "PricelistItem_pricelistId_fkey" FOREIGN KEY ("pricelistId") REFERENCES "Pricelist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricelistItem" ADD CONSTRAINT "PricelistItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateEntry" ADD CONSTRAINT "RateEntry_rateTableId_fkey" FOREIGN KEY ("rateTableId") REFERENCES "RateTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "ImportMapping"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComputeResultLine" ADD CONSTRAINT "ComputeResultLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ComputeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComputeResultLine" ADD CONSTRAINT "ComputeResultLine_salesInvoiceLineId_fkey" FOREIGN KEY ("salesInvoiceLineId") REFERENCES "SalesInvoiceLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionComponent" ADD CONSTRAINT "CommissionComponent_resultLineId_fkey" FOREIGN KEY ("resultLineId") REFERENCES "ComputeResultLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionComponent" ADD CONSTRAINT "CommissionComponent_payeeId_fkey" FOREIGN KEY ("payeeId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionItem" ADD CONSTRAINT "ExceptionItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ComputeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionItem" ADD CONSTRAINT "ExceptionItem_resultLineId_fkey" FOREIGN KEY ("resultLineId") REFERENCES "ComputeResultLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionItem" ADD CONSTRAINT "ExceptionItem_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesBond" ADD CONSTRAINT "SalesBond_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Penalty" ADD CONSTRAINT "Penalty_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TPArrangement" ADD CONSTRAINT "TPArrangement_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VouchFund" ADD CONSTRAINT "VouchFund_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
