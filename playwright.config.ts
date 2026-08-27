import {defineConfig,devices} from '@playwright/test';

const port=Number(process.env.PLAYWRIGHT_PORT??3000);
const baseURL=`http://127.0.0.1:${port}`;

export default defineConfig({
 testDir:'./tests/e2e',
 fullyParallel:true,
 retries:process.env.CI?2:0,
 reporter:process.env.CI?'github':'list',
 use:{baseURL,trace:'retain-on-failure'},
 projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
 webServer:{
  command:`npm run dev -- --hostname 127.0.0.1 --port ${port}`,
  url:baseURL,
  reuseExistingServer:!process.env.CI,
  timeout:120_000,
  env:{...process.env,TRIP_PASSWORD:'test-editor-pin',AUTH_SECRET:'test-auth-secret'}
 }
});
