import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests',timeout:60000,workers:1,use:{baseURL:'http://localhost:5173',headless:true,channel:'chrome',launchOptions:{args:['--enable-unsafe-swiftshader']},viewport:{width:1440,height:1100}}});
