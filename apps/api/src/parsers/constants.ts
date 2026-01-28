// Shared parsing constants for NVL parsers

export const STATE_CODES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
];

export const STATE_CODE_CAPTURE = `(?:${STATE_CODES.join('|')})`;
export const STATE_CODE_LINE_RE = new RegExp(`^${STATE_CODE_CAPTURE}$`, 'i');

// City lines are typically all caps letters and spaces in OCR
export const CITY_LINE_RE = /^[A-Z][A-Z\s]+$/;

// Lookahead limits for scanning nearby lines after headers
export const ORIGIN_LOOKAHEAD_LINES = 15;
export const DEST_LOOKAHEAD_LINES = 10;
export const DEST_STATE_LOOKAHEAD_AFTER_CITY = 8;

// Section span limits used in dot-all regexes
export const BOL_SECTION_SPAN = 200; // characters after BOL header to search
export const NET_BALANCE_SECTION_SPAN = 500; // characters after NET BALANCE to search
export const CUT_RATE_SECTION_SPAN = 100; // characters between CUT* and TARIFF

// Remittance parser scan limits for top-of-document heuristics
export const CHECK_SCAN_TOP_LINES = 10;
export const ACCOUNT_SCAN_TOP_LINES = 20;

// Additional scan spans used in revenue-distribution parser
export const ORIGIN_SECTION_SCAN_CHARS = 1200; // characters after ORIGIN to scan when detecting decade
export const DESTINATION_FALLBACK_LOOKAHEAD = 10; // lines to scan in ORIGIN section for destination fallback

// Posting Ticket parser scan span
export const POSTING_TICKET_DEBIT_SECTION_SPAN = 200; // characters after DEBIT header to search for amount

// Remittance week calculation offsets relative to check date
export const WEEK_END_OFFSET_DAYS = -7; // Settlement week ends 7 days before check date
export const WEEK_DURATION_DAYS = -6;  // Settlement week spans 7 days (start is 6 days before end)

// Advance parser scan span for TOTAL CHARGE search
export const ADVANCE_TOTAL_CHARGE_SCAN_SPAN = 300; // characters after TOTAL CHARGE header to search
