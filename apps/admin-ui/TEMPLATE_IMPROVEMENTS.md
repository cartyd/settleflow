# Nunjucks Template Improvements

## Overview
This document describes the improvements made to fix code smells and bad practices in the Nunjucks templates.

## Changes Summary

### 1. Created Macros File (`views/macros.njk`)

A centralized collection of reusable template macros to eliminate code duplication:

- **`formatCurrency(amount, symbol, decimals, fallback)`** - Formats currency with fallback for undefined values
- **`statusBadge(status, statusClasses, fallback)`** - Renders consistent status badges
- **`dateRange(startDate, endDate, startFormat, endFormat, fallback)`** - Formats date ranges
- **`safeValue(value, fallback)`** - Safe value access with fallback
- **`infoCard(label, value)`** - Renders info cards for detail view
- **`formatDate(date, format, fallback)`** - Formats single dates with fallback

### 2. Layout Template Improvements (`views/layout.njk`)

**Before:**
- Empty `<h1>` rendered when child templates didn't provide heading
- No skip link for keyboard navigation
- No footer
- Missing semantic structure

**After:**
- ✅ Skip link for accessibility (`<a href="#main-content">`)
- ✅ Conditional heading block (only renders `<h1>` if child provides content)
- ✅ Footer with copyright information
- ✅ `currentYear` variable passed from controller
- ✅ Main content has `id="main-content"` for skip link target
- ✅ Blocks for `header` and `footer` allowing child templates to override

### 3. Error Template Improvements (`views/error.njk`)

**Before:**
- Function calls in template (`config.pageTitle(statusCode)`)
- No explicit escaping of user content
- Magic number comparison (`statusCode >= 500`)
- Missing heading block override

**After:**
- ✅ All user content explicitly escaped with `| escape`
- ✅ `pageTitle` computed in controller
- ✅ `showSupportLink` boolean computed in controller (no logic in template)
- ✅ Overrides `header` block to prevent empty `<h1>`
- ✅ No function calls or business logic in template

### 4. Detail Template Improvements (`views/batches/detail.njk`)

**Before:**
- Function calls in template
- Three identical info-item blocks
- Complex nested conditionals
- Repeated currency formatting
- `<div role="list">` instead of semantic `<ul>`

**After:**
- ✅ Uses macros for all repeated patterns
- ✅ All user content explicitly escaped
- ✅ `pageTitle` computed in controller
- ✅ `<ul>` and `<li>` for file list (semantic HTML)
- ✅ `aria-labelledby` for section accessibility
- ✅ Overrides `header` block to prevent empty `<h1>`
- ✅ Consolidated info cards using `infoCard` macro

### 5. Table Template Improvements (`views/batches/table.njk`)

**Before:**
- Incorrect `role="grid"` on table
- Function calls in template (`detailViewPath(batch.id)`)
- Repeated status and currency logic
- Visible caption cluttering UI

**After:**
- ✅ Removed incorrect `role="grid"` (native table semantics)
- ✅ Caption has `sr-only` class (hidden visually, available to screen readers)
- ✅ Uses macros for status, currency, and date formatting
- ✅ All user content explicitly escaped
- ✅ `detailUrl` pre-computed in controller
- ✅ Imports macros at top of file

### 6. Route Handler Improvements (`src/routes/batches.ts`)

**Business logic moved from templates to controllers:**

```typescript
// List view
const batchesWithUrls = (batchesData.batches || []).map(batch => ({
  ...batch,
  detailUrl: batchesViewConfig.detailViewPath(batch.id),
}));

// Detail view
const pageTitle = batchDetailConfig.pageTitle(
  batch.nvlPaymentRef || 'Unknown'
);

// Both views
currentYear: new Date().getFullYear()
```

### 7. Error Handler Improvements (`src/middleware/errorHandler.ts`)

**Computed values moved to controller:**

```typescript
const errorResponse: ErrorResponse = {
  statusCode,
  pageTitle: errorPageConfig.pageTitle(statusCode),
  showSupportLink: statusCode >= 500,
  // ... other fields
};
```

### 8. CSS Improvements (`public/css/batches.css`)

**New accessibility styles:**

```css
/* Skip link - hidden until focused */
.skip-link {
  position: absolute;
  top: -40px;
  /* Appears at top when focused */
}

/* Screen reader only content */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  /* Visually hidden, available to screen readers */
}

/* Footer styling */
footer {
  margin-top: 40px;
  padding: 20px 0;
  border-top: 1px solid #e0e0e0;
}

/* File list as semantic ul/li */
.file-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
```

## Code Smells Fixed

### Template-Level Issues

| Issue | Before | After |
|-------|--------|-------|
| Function calls in templates | `{{ config.pageTitle(statusCode) }}` | `{{ pageTitle \| escape }}` |
| No explicit escaping | `{{ title }}` | `{{ title \| escape }}` |
| Duplicated code | 3x identical info-item blocks | 1x `infoCard` macro |
| Complex conditionals | `batch.agency.name or 'N/A' if batch.agency else 'N/A'` | `macros.safeValue(batch.agency.name if batch.agency)` |
| Magic numbers | `statusCode >= 500` | `showSupportLink` boolean |
| Incorrect ARIA roles | `role="grid"` | Removed (use native semantics) |
| Non-semantic HTML | `<div role="list">` | `<ul>` and `<li>` |

### Layout Issues

| Issue | Before | After |
|-------|--------|-------|
| Empty heading | Always rendered `<h1></h1>` | Conditional: `{% if self.heading() %}` |
| No skip link | Missing | `<a href="#main-content">` |
| No footer | Missing | Footer with copyright |
| Main not targetable | No id | `id="main-content"` |

### Accessibility Issues

| Issue | Before | After |
|-------|--------|-------|
| No keyboard navigation | Missing | Skip link |
| Visible but redundant caption | `<caption>` visible | `<caption class="sr-only">` |
| Missing ARIA relationships | None | `aria-labelledby` for sections |
| Poor screen reader support | Limited | Multiple ARIA improvements |

## Best Practices Applied

### 1. Separation of Concerns
- ✅ Business logic in controllers
- ✅ Presentation logic in templates
- ✅ Reusable components in macros

### 2. Security
- ✅ All user content explicitly escaped
- ✅ No raw HTML rendering
- ✅ Safe URL construction

### 3. Accessibility (WCAG 2.1)
- ✅ Skip links (WCAG 2.4.1)
- ✅ Semantic HTML (WCAG 1.3.1)
- ✅ ARIA labels (WCAG 4.1.2)
- ✅ Screen reader support (WCAG 4.1.3)

### 4. Maintainability
- ✅ DRY principle (macros for repeated code)
- ✅ Single source of truth (configuration)
- ✅ Consistent patterns across templates
- ✅ Clear comments documenting intent

### 5. Performance
- ✅ Minimal template logic
- ✅ Pre-computed values in controller
- ✅ Efficient macro usage

## Migration Guide

### For New Templates

1. **Import macros:**
   ```nunjucks
   {% import "macros.njk" as macros %}
   ```

2. **Use macros instead of inline logic:**
   ```nunjucks
   {# Instead of: #}
   {% if amount is defined %}
     ${{ amount | number(2) }}
   {% else %}
     N/A
   {% endif %}
   
   {# Use: #}
   {{ macros.formatCurrency(amount, '$', 2) }}
   ```

3. **Always escape user content:**
   ```nunjucks
   {{ userValue | escape }}
   ```

4. **Compute values in controller:**
   ```typescript
   // In route handler
   const computed = someFunction(data);
   return reply.view('template.njk', { computed });
   ```

5. **Override header if providing own h1:**
   ```nunjucks
   {% block header %}{% endblock %}
   ```

### For Existing Templates

1. Replace function calls with pre-computed values
2. Add explicit escaping to all user content
3. Replace repeated code with macro calls
4. Move business logic to controllers
5. Use semantic HTML where applicable
6. Add ARIA attributes for accessibility

## Testing Checklist

- [ ] Keyboard navigation works (skip link)
- [ ] Screen reader announces content correctly
- [ ] All user input is escaped
- [ ] No function calls in templates
- [ ] Macros work correctly
- [ ] Footer displays current year
- [ ] Status badges render correctly
- [ ] Currency formatting works
- [ ] Date ranges display properly
- [ ] Empty states show fallback content
- [ ] Error pages show appropriate support options

## Future Improvements

1. Add unit tests for macros
2. Add visual regression tests for templates
3. Implement template linting
4. Create template style guide
5. Add more macros for common patterns
6. Consider template compilation for performance
7. Add internationalization (i18n) support
