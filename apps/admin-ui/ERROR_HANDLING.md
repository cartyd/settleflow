# Error Handling System

This document describes the error handling system implemented for the SettleFlow admin UI.

## Overview

The error handling system provides a unified, user-friendly way to display errors with:
- HTTP status code-specific messaging
- Severity-based visual indicators
- Error tracking with unique IDs
- Security (no raw error exposure)
- Accessibility features
- Multiple recovery options

## Architecture

### Configuration (`src/config/viewConfig.ts`)

The `errorPageConfig` object defines:
- Status code specific messages (400, 403, 404, 500, 503)
- Default error message
- Severity levels (error, warning, info)
- Action buttons and links
- Label messages

### Utilities (`src/utils/errorHandler.ts`)

Provides error handling functions:
- `getErrorConfig(statusCode)` - Returns config for a given HTTP status
- `generateErrorId()` - Creates unique error identifiers
- `formatErrorContext(context)` - Safely formats error data

### Middleware (`src/middleware/errorHandler.ts`)

The error handler middleware:
- Catches all application errors
- Logs errors with correlation ID
- Hides sensitive information in production
- Renders error page

## Usage

### In Route Handlers

Simply throw errors - they'll be handled by the middleware:

```typescript
fastify.get('/some-route', async (request, reply) => {
  try {
    const data = await fetchData();
    return reply.view('template.njk', { data });
  } catch (error) {
    // Error handler middleware will catch this
    throw error;
  }
});
```

### Custom Error Response

For custom error responses, format the error context:

```typescript
import { formatErrorContext, generateErrorId } from '../utils/errorHandler';

const errorResponse = formatErrorContext({
  statusCode: 500,
  errorMessage: 'Optional custom message',
  errorId: generateErrorId(),
  timestamp: new Date(),
  isDevelopment: process.env.NODE_ENV === 'development',
});
```

## Error Types

The system handles these HTTP status codes with specific messaging:

- **400 Bad Request** - Invalid input, user guidance provided
- **403 Forbidden** - Permission denied, suggests contacting support
- **404 Not Found** - Page not found, links to dashboard
- **500 Server Error** - Generic error, contact support option
- **503 Service Unavailable** - Temporary issue, suggests retrying

## Error Page Features

### Visual Hierarchy
- Large status code display
- Color-coded severity (red/orange/blue)
- Clear error title and user message

### Error Details
- Error ID for support reference
- Timestamp in user's timezone
- Hidden in mobile view to save space

### Recovery Options
- Primary action: Return to Batches
- Secondary action: Go to Dashboard
- Tertiary action: Contact Support (for 5xx errors)

### Accessibility
- ARIA role="alert" on error message
- Semantic HTML structure
- Keyboard accessible buttons
- Screen reader friendly

## Security Considerations

### Information Disclosure Prevention
- Raw error messages never exposed to users
- Technical error details hidden in production
- Only generic messages shown

### Error Tracking
- Every error gets a unique ID
- Error ID logged server-side for correlation
- User can provide ID to support team

### Logging
Errors are logged with:
- Error ID
- HTTP status code
- Error message
- Full stack trace (development only)
- Request URL and method

## Styling

Error page styles include:
- Responsive grid layout
- Mobile-friendly action buttons
- Severity-based color schemes
- Hover and focus states
- Monospace font for error details

All styles are in `public/css/batches.css` under "Error Page Styles" section.

## Integration

To use this error handling system in your Fastify app:

```typescript
import { createErrorRoute } from './src/middleware/errorHandler';

fastify.register(async (fastify) => {
  createErrorRoute(fastify);
  // Register other routes...
});
```

## Future Improvements

1. Add error analytics and monitoring
2. Add email notifications for critical errors
3. Add rate limiting for error pages
4. Add retry logic for transient errors
5. Add breadcrumb navigation for error context
6. Add A/B testing for error messages
