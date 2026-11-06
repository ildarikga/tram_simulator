import {test,expect} from '@playwright/test';
test('real map, vehicle selection and driving controls',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('#map-label')).toContainText('OpenStreetMap',{timeout:45000});
 await page.locator('[data-tram="retro"]').click();await expect(page.locator('#selected-name')).toHaveText('Ретро');
 await page.locator('#start').click();await expect(page.locator('.drive-hud')).toBeVisible();
 await page.locator('#doors').click();await page.locator('#throttle').fill('100');await page.waitForTimeout(300);await expect(page.locator('#speed')).toHaveText('0');await page.locator('#doors').click();
 await page.locator('#throttle').fill('100');await expect.poll(async()=>Number(await page.locator('#speed').innerText()),{timeout:10000}).toBeGreaterThan(3);
 await page.locator('#doors').click();await expect(page.locator('#toast')).toContainText('останови');
 await page.locator('#pause').click();const speed=await page.locator('#speed').innerText();await page.waitForTimeout(350);await expect(page.locator('#speed')).toHaveText(speed);
 await page.locator('#reset').click();await expect(page.locator('.drive-hud')).toBeHidden();
 await page.screenshot({path:'test-results/desktop.png',fullPage:true});expect(errors).toEqual([]);
});
test('custom route is saved and models can be exported',async({page})=>{
 await page.goto('/');await expect(page.locator('#map-label')).toContainText('OpenStreetMap',{timeout:45000});
 await page.locator('[data-tab="routes"]').click();await page.locator('#new-route').click();
 await page.locator('#route-name').fill('Мой рейс');await page.locator('[data-stop="0"]').click();await page.locator('[data-stop="1"]').click();await page.locator('#save-route').click();
 await expect(page.locator('#route-select option:checked')).toContainText('Мой рейс');
 await page.reload();await expect(page.locator('#map-label')).toContainText('OpenStreetMap',{timeout:45000});await page.locator('[data-tab="routes"]').click();await expect(page.locator('#route-cards')).toContainText('Мой рейс');
 await page.locator('[data-tab="models"]').click();const download=page.waitForEvent('download');await page.locator('[data-export="tram"]').click();expect((await download).suggestedFilename()).toBe('kazan-tram.glb');
 const file='test-results/exported-tram.glb';await (await download).saveAs(file);await page.locator('[data-import="tram"]').click();await page.locator('#model-file').setInputFiles(file);await expect(page.locator('#toast')).toHaveText('Модель загружена');
});
test('mobile has no horizontal overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.locator('#map-label')).toContainText('OpenStreetMap',{timeout:45000});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.screenshot({path:'test-results/mobile.png',fullPage:true});
});
test('city overview shows selected route and named real stops',async({page})=>{
 await page.goto('/');await expect(page.locator('#map-label')).toContainText('OpenStreetMap',{timeout:45000});
 await expect(page.locator('#overview-number')).toHaveText('2');await page.locator('#stop-list').click();
 await expect(page.locator('.route-stop-list')).toContainText('Речной порт');await expect(page.locator('.route-stop-list')).toContainText('Железнодорожный вокзал');
 expect(await page.locator('.route-stop-list li').count()).toBeGreaterThan(2);await page.locator('.dialog-close').click();
 await page.locator('#route-select').selectOption('8');await expect(page.locator('#overview-number')).toHaveText('8');
 await page.locator('#start').click();await page.locator('#doors').click();await page.waitForTimeout(1100);
 await page.screenshot({path:'test-results/open-doors.png',fullPage:true});
 await page.locator('[data-camera="orbit"]').click();await expect(page.locator('#route-overview')).toBeVisible();
 await page.screenshot({path:'test-results/route-overview.png',fullPage:true});
});
