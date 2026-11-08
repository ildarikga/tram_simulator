import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
await mkdir('public/models',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({acceptDownloads:true});await page.goto('http://localhost:5173');await page.locator('#map-label').filter({hasText:'OpenStreetMap'}).waitFor({timeout:45000});
 if(process.argv.includes('--station-only')){
  const pending=page.waitForEvent('download',{timeout:60000});
  await page.evaluate(async()=>{
   const {createStationDistrict,stationPilotPath}=await import('/src/station-buildings.js');
   const {GLTFExporter}=await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
   const data=await(await fetch('/data/kazan-map.geojson')).json();
   const district=createStationDistrict(stationPilotPath(data.features));
   for(const f of data.features){if(f.properties.layer!=='building'||f.properties.hide_3d)continue;for(const poly of f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates)district.add(poly,f.properties);}
   const group=district.finish();group.traverse(o=>{if(o.isLOD)o.autoUpdate=false;});group.updateMatrixWorld(true);
   const result=await new GLTFExporter().parseAsync(group,{binary:true,onlyVisible:true});
   const url=URL.createObjectURL(new Blob([result],{type:'model/gltf-binary'}));const a=document.createElement('a');a.href=url;a.download='kazan-station-district.glb';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  await(await pending).saveAs('public/models/kazan-station-district.glb');console.log('Exported station district');
 }else{
 for(const id of process.argv.includes('--city-only')?[]:['retro','classic','long','compact','yellow','blue']){
  await page.locator('[data-tab="garage"]').click();await page.locator(`[data-tram="${id}"]`).click();
  await page.locator('[data-tab="models"]').click();const pending=page.waitForEvent('download');await page.locator('[data-export="tram"]').click();const file=await pending;await file.saveAs(`public/models/tram-${id}.glb`);console.log('Exported',id);
 }
 const pending=page.waitForEvent('download',{timeout:60000});await page.locator('[data-export="city"]').click();const file=await pending;await file.saveAs('public/models/kazan-center.glb');console.log('Exported Kazan center');
 }
}finally{await browser.close();}
