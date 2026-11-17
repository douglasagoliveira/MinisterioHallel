import { defineConfig } from '@playwright/test';
import { join } from 'node:path';
const port=3101, url=`http://127.0.0.1:${port}`;
export default defineConfig({
 testDir:'tests/e2e', workers:1, fullyParallel:false, timeout:35_000, reporter:'list',
 use:{baseURL:url,headless:true,viewport:{width:1440,height:900},trace:'retain-on-failure'},
 webServer:{command:`npm run start -- --port ${port}`,url:`${url}/api/state`,timeout:40_000,reuseExistingServer:false,env:{HALLEL_MODE:'demo',HALLEL_DEMO_DIR:join(process.cwd(),'.local',`e2e-${process.pid}`),NEXT_TELEMETRY_DISABLED:'1'}},
});
