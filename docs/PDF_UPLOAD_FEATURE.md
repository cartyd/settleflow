# PDF Upload and OCR Feature

## Overview

The SettleFlow application now supports uploading PDF settlement files and automatically extracting text using OCR (Optical Character Recognition) powered by Ollama vision models.

## Architecture

### Components

1. **OCR Service** (`apps/api/src/services/ocr.service.ts`)
   - Converts PDF pages to PNG images using `pdftocairo`
   - Sends images to Ollama for text extraction
   - Returns structured page text data

2. **Import Service** (`apps/api/src/services/import.service.ts`)
   - Handles PDF upload processing
   - Creates database records (ImportFile, ImportDocument)
   - Detects document types
   - Stores extracted text

3. **Upload Endpoint** (`POST /api/batches/:id/upload`)
   - Accepts multipart file uploads
   - Validates PDF files
   - Processes asynchronously
   - Returns import results

### Data Flow

```
PDF Upload → API Endpoint → Import Service → OCR Service → Ollama
                                    ↓
                              Database Storage
                         (ImportFile + ImportDocuments)
```

## Prerequisites

### System Requirements

1. **pdftocairo** (from Poppler)
   ```bash
   # macOS
   brew install poppler
   
   # Ubuntu/Debian
   apt-get install poppler-utils
   
   # Verify installation
   which pdftocairo
   ```

2. **Ollama Server** with vision model
   - Server must be running and accessible
   - Vision model must be pulled (e.g., `gemma3:27b`)
   ```bash
   ollama pull gemma3:27b
   ollama serve
   ```

### Configuration

Add these environment variables to your `.env` file:

```env
# OCR Configuration
OCR_ENABLED=true
OCR_SERVER_URL=http://10.147.17.205:11434/api/generate
OCR_MODEL=gemma3:27b
```

## API Usage

### Upload PDF File

**Endpoint:** `POST /api/batches/:id/upload`

**Request:**
```bash
curl -X POST http://localhost:3000/batches/{batchId}/upload \
  -F "file=@/path/to/settlement.pdf" \
  -H "Content-Type: multipart/form-data"
```

**Response:**
```json
{
  "importId": "uuid-here",
  "documentsDetected": 5,
  "linesProcessed": 0
}
```

**Error Responses:**

- `400 Bad Request` - No file uploaded or invalid file type
- `404 Not Found` - Batch not found
- `500 Internal Server Error` - OCR processing failed
- `503 Service Unavailable` - OCR service disabled

### Example with Real File

```bash
# Upload the sample settlement file
curl -X POST http://localhost:3000/batches/abc-123/upload \
  -F "file=@docs/ELECSETTLEBACKUP-121825.PDF"
```

## Database Schema

### ImportFile
```prisma
model ImportFile {
  id          String
  batchId     String
  fileName    String
  fileSize    Int
  uploadedAt  DateTime
  approvedAt  DateTime?
  approvedBy  String?
  
  importDocuments ImportDocument[]
}
```

### ImportDocument
```prisma
model ImportDocument {
  id            String
  importFileId  String
  documentType  String    // REMITTANCE, SETTLEMENT_DETAIL, etc.
  pageNumber    Int
  rawText       String    // Extracted OCR text
  parsedAt      DateTime?
  
  importLines ImportLine[]
}
```

## Processing Details

### PDF Conversion

1. PDF is saved to temporary directory
2. `pdftocairo` converts each page to PNG format
3. Images are named sequentially: `prefix-1.png`, `prefix-2.png`, etc.
4. Temporary files are cleaned up after processing

### OCR Processing

1. Each PNG image is converted to base64
2. Base64 image is sent to Ollama with prompt:
   ```
   Extract and return all text from this image. 
   Provide only the text content without any additional commentary.
   ```
3. Ollama returns extracted text
4. Text is trimmed and stored

### Document Type Detection

The system automatically detects document types based on text patterns:
- REMITTANCE
- SETTLEMENT_DETAIL  
- REVENUE_DISTRIBUTION
- ADVANCE_ADVICE
- CREDIT_DEBIT
- UNKNOWN (fallback)

See `apps/api/src/parsers/nvl/detectDocumentType.ts` for detection logic.

## Error Handling

### Graceful Degradation

- If OCR fails for a page, an empty text entry is created
- Processing continues with remaining pages
- Errors are logged but don't halt the entire import

### Cleanup

- Temporary files are always cleaned up
- Uses `try/finally` blocks to ensure cleanup
- Failed uploads don't leave orphaned temp files

## Performance Considerations

### File Size Limits

- Maximum file size: 50MB (configurable in `apps/api/src/app.ts`)
- Adjust based on your needs:
  ```typescript
  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
    },
  });
  ```

### Processing Time

Processing time depends on:
- Number of pages in PDF
- Ollama server performance
- Network latency
- Image resolution

**Estimated times:**
- 1-page PDF: 5-10 seconds
- 10-page PDF: 50-100 seconds
- 50-page PDF: 4-8 minutes

### Optimization Tips

1. **Use faster Ollama models** for production
2. **Process in background** for large files
3. **Cache results** if reprocessing same file
4. **Limit concurrent uploads** to avoid overwhelming Ollama

## Testing

### Manual Testing

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Create a test batch:
   ```bash
   curl -X POST http://localhost:3000/batches \
     -H "Content-Type: application/json" \
     -d '{
       "agencyId": "test-agency",
       "nvlPaymentRef": "TEST-001",
       "weekStartDate": "2024-01-01",
       "weekEndDate": "2024-01-07"
     }'
   ```

3. Upload a PDF:
   ```bash
   curl -X POST http://localhost:3000/batches/{batchId}/upload \
     -F "file=@docs/ELECSETTLEBACKUP-121825.PDF"
   ```

4. Verify in database:
   ```bash
   cd apps/api
   npx prisma studio
   ```

## Troubleshooting

### "pdftocairo not found"

**Problem:** System can't find pdftocairo binary

**Solution:**
```bash
# Install Poppler
brew install poppler

# Verify installation
which pdftocairo
```

### "Ollama API error"

**Problem:** Can't connect to Ollama server

**Solutions:**
1. Check if Ollama is running: `curl http://localhost:11434`
2. Verify server URL in `.env`
3. Ensure vision model is pulled: `ollama list`
4. Check firewall settings

### "OCR service is not enabled"

**Problem:** OCR is disabled in configuration

**Solution:**
Set `OCR_ENABLED=true` in `.env` file

### Slow processing

**Problem:** PDF takes too long to process

**Solutions:**
1. Use a smaller/faster Ollama model
2. Reduce PDF resolution before upload
3. Split large PDFs into smaller chunks
4. Run Ollama locally instead of remote server

## Future Enhancements

- [ ] Add progress reporting during processing
- [ ] Support batch uploads (multiple PDFs)
- [ ] Add preview before processing
- [ ] Implement retry logic for failed pages
- [ ] Add text post-processing/cleanup
- [ ] Support other OCR engines (Tesseract, Google Vision)
- [ ] Add caching for previously processed files
- [ ] Implement background job queue for large files
- [ ] Add webhook notifications when processing completes

## Security Considerations

1. **File Validation**
   - Only PDF files are accepted
   - File size limits enforced
   - MIME type checking

2. **Temporary Files**
   - Created in OS temp directory
   - Unique directory per upload
   - Automatic cleanup after processing

3. **API Security**
   - Rate limiting applied
   - CORS configured
   - Authentication required (when implemented)

4. **Data Storage**
   - OCR text stored in database
   - Original PDFs not permanently stored
   - Can add encryption if needed

## Related Files

- `apps/api/src/services/ocr.service.ts` - Core OCR functionality
- `apps/api/src/services/import.service.ts` - Import processing
- `apps/api/src/routes/batches.ts` - Upload endpoint
- `apps/api/src/parsers/nvl/detectDocumentType.ts` - Type detection
- `packages/shared-config/src/index.ts` - Configuration
- `docs/ocr-pdf.ts` - Original standalone OCR script
