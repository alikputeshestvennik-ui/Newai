import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/browser',workers:1,timeout:90000,
  webServer:{command:'npm run dev -- --port 4190',url:'http://localhost:4190'},
  use:{baseURL:'http://localhost:4190',launchOptions:{executablePath:process.env.VENICE_CHROME,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
});
