---
name: browser-verification-harness
description: Build and operate an AI-friendly browser verification harness using Playwright or Puppeteer. Use when the user wants E2E strategy, visual regression checks, accessibility tree inspection, browser-driven verification, or a harness that lets an agent validate UI like a user.
disable-model-invocation: true
---

# Browser Verification Harness

Use this skill to give an agent reliable browser-level verification instead of relying on compile success alone.

## When to Use

- The user wants AI to catch layout regressions or broken UI flows.
- The user mentions Playwright, Puppeteer, browser automation, screenshots, or accessibility trees.
- The task needs a verification loop for frontend changes.
- The user wants harness-engineering patterns applied to UI validation.

## Core Model

Treat browser verification as a harness problem:

1. Define a narrow action space: open page, interact, inspect structure, capture artifacts.
2. Produce deterministic observations: assertions, a11y tree snapshots, screenshots, traces.
3. Fail with explicit recovery hints: what was missing, what selector failed, what artifact to inspect.
4. Keep prompt guidance short and move repeatable logic into test helpers and scripts.

## Recommended Stack

- Default to `Playwright` for new work.
- Use `Puppeteer` only when the codebase already standardizes on it or needs Chrome DevTools specific flows.
- Prefer `@playwright/test` over ad hoc scripts when the work should run in CI.

## Verification Layers

Use all three layers together; do not rely on one signal.

### 1. Structural verification

Check user-visible roles and names through the accessibility tree.

- Assert `getByRole()` and accessible names instead of brittle CSS selectors where possible.
- Snapshot or serialize the accessibility tree for key screens.
- Verify headings, buttons, dialogs, alerts, form fields, tables, and navigation landmarks.

### 2. Behavioral verification

Exercise real user flows.

- Navigation
- Form entry
- Submission and error states
- Loading and empty states
- Auth gates
- Mobile and desktop breakpoints

### 3. Visual verification

Use screenshots for issues the a11y tree cannot express.

- Layout collapse
- Overflow/clipping
- Missing spacing
- Hidden text
- Unexpected overlap
- Theme regressions

Prefer targeted screenshots for critical components and full-page screenshots only for stable pages.

## Golden Rule

The accessibility tree is the agent's primary UI interface. Screenshots are secondary evidence for visual anomalies. DOM selectors are a fallback.

## Minimum Harness

For each critical route, aim to provide:

- A deterministic URL or setup step
- One smoke interaction path
- One a11y-based assertion set
- One screenshot artifact
- One trace artifact on failure

## Playwright Patterns

### Route smoke test

```ts
import { test, expect } from '@playwright/test'

test('settings page is operable', async ({ page }) => {
  await page.goto('/settings')

  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('status')).toContainText('Saved')
})
```

### Accessibility tree capture

```ts
const snapshot = await page.accessibility.snapshot()
console.log(JSON.stringify(snapshot, null, 2))
```

Use this for debugging, for fixture generation, or to compare key structures in stable surfaces. Avoid asserting the entire tree when small targeted assertions are enough.

### Screenshot capture

```ts
await page.screenshot({ path: 'artifacts/settings.png', fullPage: true })
```

### Better selectors

Prefer this order:

1. `getByRole`
2. `getByLabel`
3. `getByText`
4. `getByTestId`
5. CSS/XPath only when unavoidable

## Harness Design Rules

### Observations

Every helper or script should return or log:

- `status`
- `summary`
- `next_actions`
- `artifacts`

If the surrounding test runner does not support a structured object, emit these fields in logs.

### Artifact strategy

Capture artifacts that help an agent recover:

- Failure screenshot
- Trace on retry or failure
- Relevant console errors
- Network failures for 4xx/5xx
- Accessibility snapshot for the failing view

### Stop conditions

Stop and surface a blocker when:

- Auth cannot be bootstrapped deterministically
- Test data is not reproducible
- Animation/timing causes non-deterministic failures and cannot be disabled
- The UI has no stable accessible names or test IDs for critical actions

## CI Strategy

Run browser verification in tiers:

### Tier 1: PR smoke

- Critical routes only
- Chromium only
- Fast assertions
- Failure screenshots and traces

### Tier 2: Main branch regression

- Multi-page flows
- Desktop plus one mobile viewport
- Visual snapshots for the most fragile pages

### Tier 3: Scheduled deep verification

- Cross-browser matrix if needed
- Longer workflows
- Broader a11y and visual coverage

## Implementation Workflow

1. Identify the top 3 to 5 routes where a broken UI would matter.
2. Write one Playwright smoke test per route using roles and accessible names.
3. Add screenshot artifacts for each route.
4. Add accessibility snapshot capture for at least one representative screen per flow.
5. Wire traces, console capture, and network error logging.
6. Put the suite in CI as a required verification gate.

## Anti-Patterns

- Treating compile success as UI validation
- Using only screenshots and no structural assertions
- Using only DOM selectors and no accessible roles
- Over-snapshotting unstable pages
- Waiting with fixed sleeps instead of observable conditions
- Building one giant end-to-end test instead of small critical-path checks

## If the User Wants a New Setup

Default recommendation:

- `Playwright`
- `@playwright/test`
- role-first selectors
- screenshots on failure
- traces on first retry
- one desktop and one mobile viewport

If the repo already has Puppeteer, preserve it unless migration cost is justified.

## Generic Playwright Suite Patterns

Use these patterns when you need a full suite layout — Page Object Model, playwright.config.ts, flaky test recovery, CI/CD, and artifact pipelines — in addition to the agent-facing harness rules above.

### Test File Organization

```
tests/
├── e2e/
│   ├── auth/
│   │   ├── login.spec.ts
│   │   ├── logout.spec.ts
│   │   └── register.spec.ts
│   ├── features/
│   │   ├── browse.spec.ts
│   │   ├── search.spec.ts
│   │   └── create.spec.ts
│   └── api/
│       └── endpoints.spec.ts
├── fixtures/
│   ├── auth.ts
│   └── data.ts
└── playwright.config.ts
```

### Page Object Model

```typescript
import { Page, Locator } from '@playwright/test'

export class ItemsPage {
  readonly page: Page
  readonly searchInput: Locator
  readonly itemCards: Locator

  constructor(page: Page) {
    this.page = page
    this.searchInput = page.getByRole('searchbox', { name: 'Search items' })
    this.itemCards = page.getByRole('listitem')
  }

  async goto() {
    await this.page.goto('/items')
    await this.page.waitForLoadState('networkidle')
  }

  async search(query: string) {
    await this.searchInput.fill(query)
    await this.page.waitForResponse(resp => resp.url().includes('/api/search'))
  }

  async getItemCount() {
    return await this.itemCards.count()
  }
}
```

Prefer role-based selectors over `data-testid` where accessible names exist (see Golden Rule above). Reserve `data-testid` for elements with no stable accessible name.

### Playwright Configuration

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'playwright-results.xml' }],
    ['json', { outputFile: 'playwright-results.json' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
```

### Flaky Test Recovery

Quarantine known-flaky tests instead of disabling silently:

```typescript
test('flaky: complex search', async ({ page }) => {
  test.fixme(true, 'Flaky - Issue #123')
})

test('conditional skip', async ({ page }) => {
  test.skip(!!process.env.CI, 'Flaky in CI - Issue #123')
})
```

Identify flakiness with repeat runs:

```bash
npx playwright test tests/search.spec.ts --repeat-each=10
npx playwright test tests/search.spec.ts --retries=3
```

Common causes and fixes:

```typescript
// Race conditions — prefer auto-waiting locators
await page.locator('[data-testid="button"]').click()  // not page.click(...)

// Network timing — wait for the specific response, not a timeout
await page.waitForResponse(resp => resp.url().includes('/api/data'))

// Animation timing — wait for stability before interacting
await page.locator('[data-testid="menu-item"]').waitFor({ state: 'visible' })
await page.waitForLoadState('networkidle')
```

### Artifact Pipeline

```typescript
await page.screenshot({ path: 'artifacts/after-login.png' })
await page.screenshot({ path: 'artifacts/full-page.png', fullPage: true })
await page.locator('[data-testid="chart"]').screenshot({ path: 'artifacts/chart.png' })
```

For traces, prefer config-level `trace: 'on-first-retry'` over manual `browser.startTracing`.

### CI/CD Integration

```yaml
# .github/workflows/e2e.yml
name: E2E Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
        env:
          BASE_URL: ${{ vars.STAGING_URL }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

### Critical / Financial Flow Testing

For trade execution, payment, or other irreversible flows, gate against production and wait for the backend response explicitly:

```typescript
test('trade execution', async ({ page }) => {
  test.skip(process.env.NODE_ENV === 'production', 'Skip on production')

  await page.goto('/markets/test-market')
  await page.locator('[data-testid="position-yes"]').click()
  await page.locator('[data-testid="trade-amount"]').fill('1.0')

  await expect(page.locator('[data-testid="trade-preview"]')).toContainText('1.0')

  await page.locator('[data-testid="confirm-trade"]').click()
  await page.waitForResponse(
    resp => resp.url().includes('/api/trade') && resp.status() === 200,
    { timeout: 30000 }
  )

  await expect(page.locator('[data-testid="trade-success"]')).toBeVisible()
})
```

### Test Report Template

```markdown
# E2E Test Report

**Date:** YYYY-MM-DD HH:MM
**Duration:** Xm Ys
**Status:** PASSING / FAILING

## Summary
- Total: X | Passed: Y (Z%) | Failed: A | Flaky: B | Skipped: C

## Failed Tests
### test-name
**File:** `tests/e2e/feature.spec.ts:45`
**Error:** Expected element to be visible
**Screenshot:** artifacts/failed.png
**Recommended Fix:** [description]

## Artifacts
- HTML Report: playwright-report/index.html
- Screenshots: artifacts/*.png
- Videos: artifacts/videos/*.webm
- Traces: artifacts/*.zip
```

