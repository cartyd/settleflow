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
