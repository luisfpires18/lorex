# Lorex.E2E

Playwright end-to-end tests.

`playwright.config.ts` boots the API (`http://localhost:5180`) and the Vite dev server
(`http://localhost:5173`) via `webServer`, reusing anything already running locally.

```
npm install
npx playwright install chromium
npm test
```
