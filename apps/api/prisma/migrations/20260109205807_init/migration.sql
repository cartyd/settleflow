-- CreateTable
CREATE TABLE "agencies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "drivers_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "settlement_batches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyId" TEXT NOT NULL,
    "nvlPaymentRef" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "weekStartDate" DATETIME NOT NULL,
    "weekEndDate" DATETIME NOT NULL,
    "totalRevenue" REAL NOT NULL DEFAULT 0,
    "totalAdvances" REAL NOT NULL DEFAULT 0,
    "totalDeductions" REAL NOT NULL DEFAULT 0,
    "netAmount" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lockedAt" DATETIME,
    "fundsClearedAt" DATETIME,
    "paidAt" DATETIME,
    CONSTRAINT "settlement_batches_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "import_files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME,
    "approvedBy" TEXT,
    CONSTRAINT "import_files_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "settlement_batches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "import_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importFileId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "rawText" TEXT NOT NULL,
    "parsedAt" DATETIME,
    CONSTRAINT "import_documents_importFileId_fkey" FOREIGN KEY ("importFileId") REFERENCES "import_files" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "import_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importDocumentId" TEXT NOT NULL,
    "driverId" TEXT,
    "lineType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "date" DATETIME,
    "reference" TEXT,
    "rawData" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "import_lines_importDocumentId_fkey" FOREIGN KEY ("importDocumentId") REFERENCES "import_documents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "revenue_distributions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "importLineId" TEXT,
    "grossRevenue" REAL NOT NULL,
    "commission" REAL NOT NULL,
    "netRevenue" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "revenue_distributions_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "settlement_batches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "revenue_distributions_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "revenue_distributions_importLineId_fkey" FOREIGN KEY ("importLineId") REFERENCES "import_lines" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "advances" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "importLineId" TEXT,
    "amount" REAL NOT NULL,
    "date" DATETIME NOT NULL,
    "reference" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "advances_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "settlement_batches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "advances_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "advances_importLineId_fkey" FOREIGN KEY ("importLineId") REFERENCES "import_lines" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "deductions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "importLineId" TEXT,
    "category" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "date" DATETIME NOT NULL,
    "reference" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "deductions_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "settlement_batches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "deductions_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "deductions_importLineId_fkey" FOREIGN KEY ("importLineId") REFERENCES "import_lines" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "driver_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "reviewedBy" TEXT,
    "reviewNotes" TEXT,
    CONSTRAINT "driver_requests_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "settlement_batches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "driver_requests_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "adjustments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "targetTable" TEXT NOT NULL,
    "targetRecordId" TEXT NOT NULL,
    "targetField" TEXT NOT NULL,
    "originalValue" TEXT NOT NULL,
    "adjustedValue" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "rejectedBy" TEXT,
    "rejectedAt" DATETIME,
    "rejectionReason" TEXT,
    CONSTRAINT "adjustments_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "settlement_batches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "performedBy" TEXT NOT NULL,
    "performedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "beforeSnapshot" TEXT,
    "afterSnapshot" TEXT,
    "metadata" TEXT,
    CONSTRAINT "audit_logs_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "settlement_batches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "agencies_code_key" ON "agencies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_batches_agencyId_nvlPaymentRef_key" ON "settlement_batches"("agencyId", "nvlPaymentRef");
