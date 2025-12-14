# E2E Tests

Playwright end-to-end tests for the Defect Tracking Tool.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run with UI
```bash
npm run test:ui
```

### Run in headed mode
```bash
npm run test:headed
```

### Debug tests
```bash
npm run test:debug
```

## Test Coverage

- **Login**: Authentication flow and error handling
- **Dashboard Filters**: Filtering by project, status, date range
- **Defect Creation**: Creating new defects with validation
- **Attachment Upload**: File upload functionality
- **Excel Ingestion**: QC parameters Excel upload

## Configuration

Tests are configured in `playwright.config.ts`. Default settings:
- Frontend URL: http://localhost:3001
- Backend URL: http://localhost:3000
- Automatically starts servers if not running

## Test Data

Tests use the default seed data:
- Admin: `admin` / `password123`
- User: `user` / `password123`

