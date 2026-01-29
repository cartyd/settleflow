# Sentry Integration Guide

This document describes the Sentry.io integration for error monitoring, logging, and performance tracking in SettleFlow.

## Features

### 1. Automatic Error Monitoring

- **All uncaught exceptions** are automatically captured and sent to Sentry
- **Request context** is attached to every error (method, URL, headers, query params)
- **User context** can be set for authenticated requests
- **Breadcrumbs** track the sequence of events leading to errors

### 2. Performance Monitoring (APM)

- **Request tracing**: Every HTTP request is tracked as a transaction
- **Response times**: Automatically measured for all endpoints
- **Status codes**: Track success rates and error rates
- **Custom operations**: Track performance of specific code paths (parsers, database queries, etc.)

### 3. Logging & Breadcrumbs

- **Automatic breadcrumbs** for HTTP requests
- **Custom breadcrumbs** for important events in your code
- **Metric logging** for tracking custom values

### 4. Profiling (Optional)

- CPU profiling to identify performance bottlenecks
- Disabled by default (resource-intensive)

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Required
SENTRY_DSN=https://b4dd69ff9bb2f3d39806930eee42b7a1@o4510738101370880.ingest.us.sentry.io/4510738117492736

# Optional - defaults shown
SENTRY_TRACES_SAMPLE_RATE=1.0    # 1.0 in dev, 0.1 in prod (capture 10% of transactions)
SENTRY_PROFILES_SAMPLE_RATE=0    # 0 = disabled
SENTRY_ENABLE_PROFILING=false    # Set to true to enable CPU profiling
```

### Sample Rates Explained

- **tracesSampleRate**: Percentage of transactions to capture (0.0 to 1.0)
  - `1.0` = 100% (recommended for development, expensive in production)
  - `0.1` = 10% (good balance for production)
  - `0.01` = 1% (for very high-traffic apps)

- **profilesSampleRate**: Percentage of transactions to profile
  - `0` = disabled (recommended, profiling is CPU-intensive)
  - `0.01` = 1% (if you need profiling data)

## Usage

### Automatic Tracking

Most errors and requests are tracked automatically via Fastify hooks. No code changes needed!

### Manual Error Tracking

Use the Sentry utilities in your services:

```typescript
import { captureCustomError, addBreadcrumb } from '../utils/sentry';

async function processPayment(amount: number) {
  addBreadcrumb('Processing payment', 'payment', 'info', { amount });

  try {
    const result = await chargeCard(amount);
    return result;
  } catch (error) {
    // Capture with additional context
    captureCustomError(error as Error, {
      level: 'error',
      tags: {
        payment_method: 'credit_card',
        currency: 'USD',
      },
      extra: {
        amount,
        timestamp: new Date().toISOString(),
      },
    });
    throw error;
  }
}
```

### Performance Tracking

Track custom operations:

```typescript
import { startPerformanceTracking, logMetric } from '../utils/sentry';

async function parseLargeDocument(doc: Document) {
  const metric = startPerformanceTracking('parser.parse_document', {
    documentType: doc.type,
    pageCount: doc.pages.length,
  });

  try {
    const result = await parser.parse(doc);

    // Log custom metrics
    logMetric('document.pages_parsed', result.pages.length, 'pages', {
      documentType: doc.type,
    });

    metric.setStatus('ok');
    metric.finish({
      linesExtracted: result.lines.length,
      errorsCount: result.errors.length,
    });

    return result;
  } catch (error) {
    metric.setStatus('internal_error');
    throw error;
  }
}
```

### Simplified Tracking with Wrapper

Use `trackAsyncOperation` for automatic error capture and performance tracking:

```typescript
import { trackAsyncOperation } from '../utils/sentry';

async function processImportFile(fileId: string) {
  return trackAsyncOperation(
    'import.process_file',
    async () => {
      // Your code here
      const file = await getFile(fileId);
      const result = await parseAndSave(file);
      return result;
    },
    { fileType: 'PDF', fileId }
  );
}
```

### User Context

Set user context for authenticated requests:

```typescript
import { setUser } from '../utils/sentry';

// In your auth middleware or route handler
async function handleLogin(request: FastifyRequest) {
  const user = await authenticateUser(request);

  setUser({
    id: user.id,
    email: user.email,
    username: user.username,
  });

  // All subsequent Sentry events will include this user info
}
```

### Custom Messages

Send informational messages to Sentry:

```typescript
import { captureMessage } from '../utils/sentry';

captureMessage('Unusual activity detected', 'warning', {
  tags: { module: 'fraud_detection' },
  extra: { details: 'Multiple failed login attempts' },
});
```

## Sentry Dashboard

### Viewing Errors

1. Go to https://sentry.io
2. Navigate to your project
3. View the **Issues** tab for aggregated errors
4. Click any issue to see:
   - Error message and stack trace
   - Request context (URL, method, headers)
   - Breadcrumbs (sequence of events)
   - User information
   - Environment and release

### Performance Monitoring

1. Navigate to the **Performance** tab
2. See overall metrics:
   - Requests per minute
   - Average response time
   - Error rates
   - Slowest transactions
3. Click any transaction to see:
   - Detailed trace
   - Time spent in each operation
   - Database queries
   - External API calls

### Filtering and Search

Use tags to filter issues:

- `environment:development` or `environment:production`
- `route:/batches/:id`
- `method:POST`
- `errorType:ValidationError`

## Best Practices

### 1. Tag Your Errors

Always add relevant tags for better filtering:

```typescript
captureCustomError(error, {
  tags: {
    module: 'parser',
    documentType: 'REVENUE_DISTRIBUTION',
    batchId: batch.id,
  },
});
```

### 2. Add Context

Include extra data for debugging:

```typescript
captureCustomError(error, {
  extra: {
    inputData: sanitizedInput,
    configuration: config,
    timestamp: new Date().toISOString(),
  },
});
```

### 3. Use Breadcrumbs

Add breadcrumbs before critical operations:

```typescript
addBreadcrumb('Starting OCR processing', 'ocr', 'info', {
  pageCount: pages.length,
  modelUsed: config.model,
});
```

### 4. Sensitive Data

The Sentry plugin automatically filters:

- Authorization headers
- Cookies
- API keys
- Passwords and tokens in query strings

If you need to add custom filtering, update `beforeSend` in `apps/api/src/plugins/sentry.ts`.

### 5. Sample Rates

For production:

- Use `tracesSampleRate: 0.1` (10%) to reduce costs
- Only enable profiling if needed (very expensive)

For development:

- Use `tracesSampleRate: 1.0` (100%) to catch everything

## Troubleshooting

### No events showing in Sentry

1. Check DSN is set: `echo $SENTRY_DSN`
2. Check logs for "Sentry plugin initialized"
3. Verify environment is correct (dev/prod)
4. Test manually:
   ```typescript
   fastify.sentry.captureMessage('Test from SettleFlow');
   ```

### Too many events

1. Reduce `SENTRY_TRACES_SAMPLE_RATE`
2. Add URLs to ignore list in `beforeBreadcrumb`
3. Filter out noise in `ignoreErrors`

### Missing context

1. Ensure you're calling `setUser()` after authentication
2. Add custom tags with `setTags()`
3. Use breadcrumbs liberally with `addBreadcrumb()`

## API Reference

See `apps/api/src/utils/sentry.ts` for full API documentation.

Key functions:

- `captureCustomError(error, context)` - Capture errors with context
- `captureMessage(message, level, context)` - Log messages
- `trackAsyncOperation(name, fn, tags)` - Auto-track performance and errors
- `startPerformanceTracking(operation, data)` - Manual performance tracking
- `addBreadcrumb(message, category, level, data)` - Add debugging breadcrumbs
- `setUser(user)` - Set user context
- `setTags(tags)` - Add searchable tags
- `logMetric(name, value, unit, tags)` - Track custom metrics

## Cost Optimization

Sentry pricing is based on:

- **Events**: Errors, messages, transactions
- **Attachments**: Screenshots, replays (not enabled)

To optimize costs:

1. Lower sample rates in production (0.1 or less)
2. Filter noisy errors in `ignoreErrors`
3. Skip health checks and metrics endpoints
4. Use tags to identify and mute recurring non-critical errors

## Support

- Sentry Docs: https://docs.sentry.io/platforms/node/
- Our Config: `apps/api/src/plugins/sentry.ts`
- Utilities: `apps/api/src/utils/sentry.ts`
