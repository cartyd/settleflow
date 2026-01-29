-- Add parsing status fields to import_files table
ALTER TABLE "import_files" ADD COLUMN "parsingStatus" TEXT NOT NULL DEFAULT 'COMPLETED';
ALTER TABLE "import_files" ADD COLUMN "parsingCompletedAt" DATETIME;
ALTER TABLE "import_files" ADD COLUMN "parsingErrors" TEXT;
