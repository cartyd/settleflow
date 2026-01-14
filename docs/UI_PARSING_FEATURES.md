# UI Parsing Features

## Overview

The Admin UI now includes functionality to parse imported settlement documents and view parsed transaction data directly in the browser.

## Features Added

### 1. Parse Transactions Button
Located on each import file card in the batch detail page.

**What it does:**
- Triggers parsing of all documents in the import file
- Extracts transaction lines (revenue, advances, deductions)
- Creates ImportLine records in database
- Shows parse progress and results

**Workflow:**
1. Navigate to batch detail page
2. Find the import file card
3. Click "Parse Transactions"
4. Button shows "Parsing..." during processing
5. Results display shows:
   - Number of documents processed
   - Number of lines created
   - Any errors encountered

### 2. View Summary Button
Shows aggregated statistics about parsed transactions.

**What it displays:**
- Total number of parsed lines
- Revenue total and line count
- Advances total and line count
- Deductions total and line count

**Workflow:**
1. Click "View Summary" on any import file
2. Toggle button to show/hide summary
3. If no lines parsed yet, shows helpful message

## UI Components

### Import File Card Layout
```
┌─────────────────────────────────────┐
│ filename.pdf              [Approved]│
│                                     │
│ Uploaded: Jan 12, 2026              │
│ Size: 530 KB                        │
│ Pages: 13                           │
│                                     │
│ [Parse Transactions] [View Summary] │
│                                     │
│ ✓ Parse Complete                    │
│ Documents Processed: 13             │
│ Lines Created: 87                   │
│                                     │
│ Parsed Lines Summary                │
│ Total Lines: 87                     │
│ ┌──────────┬──────────┬──────────┐ │
│ │Revenue   │Advances  │Deductions│ │
│ │$4,205.46 │$675.50   │$189.43   │ │
│ │(2 lines) │(2 lines) │(7 lines) │ │
│ └──────────┴──────────┴──────────┘ │
│                                     │
│ Document Types:                     │
│ [SETTLEMENT_DETAIL (1)]             │
│ [REVENUE_DISTRIBUTION (3)]          │
│ [CREDIT_DEBIT (6)]                  │
└─────────────────────────────────────┘
```

### Parse Results Display

**Success State:**
```
✓ Parse Complete
Documents Processed: 13
Lines Created: 87
```

**With Errors:**
```
✓ Parse Complete
Documents Processed: 13
Lines Created: 85

Errors:
• Parser for REVENUE_DISTRIBUTION not yet implemented
• Parser for CREDIT_DEBIT not yet implemented
```

**Error State:**
```
Error: Parse request failed
```

## API Integration

### Admin UI Routes
- `POST /admin/batches/import-files/:importFileId/parse`
- `GET /admin/batches/import-files/:importFileId/summary`

These proxy to the API endpoints:
- `POST /batches/import-files/:importFileId/parse`
- `GET /batches/import-files/:importFileId/summary`

### Response Formats

**Parse Response:**
```json
{
  "importFileId": "uuid",
  "documentsProcessed": 13,
  "totalLinesCreated": 87,
  "errors": [
    "Parser for REVENUE_DISTRIBUTION not yet implemented"
  ]
}
```

**Summary Response:**
```json
{
  "totalLines": 87,
  "byLineType": {
    "REVENUE": 2,
    "ADVANCE": 2,
    "DEDUCTION": 7
  },
  "totalRevenue": 4205.46,
  "totalAdvances": 675.50,
  "totalDeductions": 189.43
}
```

## User Workflow

### Complete Workflow: Upload → Parse → Review

1. **Upload PDF**
   - Click "Upload PDF" button
   - Select settlement file
   - Wait for OCR processing (5-10 min for 13 pages)
   - Page reloads with new import file

2. **Parse Transactions**
   - Click "Parse Transactions" on import file card
   - Wait ~1-2 seconds for parsing
   - View parse results

3. **Review Summary**
   - Click "View Summary"
   - Review totals by type
   - Compare with expected amounts

4. **Verify in Database** (optional)
   ```sql
   SELECT * FROM import_lines 
   WHERE importDocumentId IN (
     SELECT id FROM import_documents 
     WHERE importFileId = 'uuid'
   );
   ```

## Styling

### Colors
- **Success**: Green (#388e3c)
- **Warning**: Orange (#f57c00)
- **Error**: Deep Orange (#e65100)
- **Info**: Blue (#0066cc)

### Status Indicators
- ✓ Parse Complete (green)
- ⚠ Errors (orange/yellow background)
- Loading... (gray, italic)

## Current Limitations

### Document Type Support
Only **SETTLEMENT_DETAIL** documents are parsed in Phase 1:
- ✅ SETTLEMENT_DETAIL - Fully supported
- ❌ REVENUE_DISTRIBUTION - Phase 2
- ❌ CREDIT_DEBIT - Phase 2
- ❌ ADVANCE_ADVICE - Phase 2
- ❌ REMITTANCE - Phase 2

When unsupported document types are encountered, they're skipped and reported in errors array.

### No Real-Time Updates
- Parse button doesn't auto-refresh summary
- Must click "View Summary" again to see updated data
- No WebSocket/polling for progress updates

### No Detailed Line View
Currently shows only summary statistics. Future enhancement:
- Table of all parsed lines
- Filtering by line type
- Export to CSV
- Edit/delete individual lines

## Testing

1. Start both servers:
   ```bash
   npm run dev
   ```

2. Navigate to batch detail:
   ```
   http://localhost:3001/admin/batches/{batchId}
   ```

3. If no import files exist, upload one first

4. Click "Parse Transactions" and verify results

5. Click "View Summary" and verify totals

## Troubleshooting

### "Parse request failed"
- Check API server is running on port 3000
- Check browser console for network errors
- Verify importFileId is valid

### No lines created
- Document type may not be SETTLEMENT_DETAIL
- OCR text quality may be poor
- Check parse errors in results display

### Summary shows zero
- Need to click "Parse Transactions" first
- ImportLines may not have been created
- Check database: `SELECT COUNT(*) FROM import_lines`

## Files Modified

### Admin UI
- `apps/admin-ui/src/services/api-client.ts` - Added parse/summary API calls
- `apps/admin-ui/src/routes/batches.ts` - Added proxy routes
- `apps/admin-ui/views/batches/detail.njk` - Added UI components and JavaScript
- `apps/admin-ui/public/css/batches.css` - Added styling

## Next Steps

Future enhancements:
1. Add detailed line view with table
2. Auto-refresh after parsing
3. Export parsed lines to CSV
4. Edit/delete lines in UI
5. Driver matching interface
6. Validation rules display
7. Batch total reconciliation view
