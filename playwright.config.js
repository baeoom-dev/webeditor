import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 설정.
 *
 * 브라우저 다운로드 없이 시스템에 설치된 Chrome(channel: 'chrome')을 사용한다.
 * webServer 로 정적 데모 서버(pnpm dev — python http.server)를 자동 기동한다.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  outputDir: './test-results',
  use: {
    baseURL: 'http://localhost:8791',
    channel: 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:8791',
    timeout: 20_000,
    reuseExistingServer: true,
  },
});
