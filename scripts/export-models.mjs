import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
await mkdir('public/models',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({acceptDownloads:true});await page.goto('http://localhost:5173');await page.locator('#map-label').filter({hasText:'OpenStreetMap'}).waitFor({timeout:45000});
 for(const id of ['retro','classic','long','compact','yellow','blue']){
  await page.locator('[data-tab="garage"]').click();await page.locator(`[data-tram="${id}"]`).click();
  await page.locator('[data-tab="models"]').click();const pending=page.waitForEvent('download');await page.locator('[data-export="tram"]').click();const file=await pending;await file.saveAs(`public/models/tram-${id}.glb`);console.log('Exported',id);
 }
 const pending=page.waitForEvent('download',{timeout:60000});await page.locator('[data-export="city"]').click();const file=await pending;await file.saveAs('public/models/kazan-center.glb');console.log('Exported Kazan center');
}finally{await browser.close();}
