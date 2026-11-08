import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

// Run against npm run dev. This isolated viewer doesn't run a second game loop.
const allRoutes=process.argv.includes('--all-routes'),output=allRoutes?'test-results/route-buildings':'test-results/station-district';
const cases=allRoutes?[['karavaevo','Караваево · маршрут 1'],['khalitova','Улица Халитова · маршрут 4'],['sunny','Солнечный город · кольцевые маршруты'],['chemical','Химическая · маршрут 8']]:[['cab','Вид из кабины'],['station','Вокзал'],['hotel','Гостиница «Волга»']];
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/__station-preview',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><style>body{margin:0}canvas{display:block}</style></head><body></body></html>'}));
 const measurements={};
 for(const detailed of [false,true]){
  await page.goto('http://localhost:5173/__station-preview');
  const stats=await page.evaluate(async({detailed,allRoutes})=>{
   const T=await import('/node_modules/.vite/deps/three.js');
   const {buildGeographicCity}=await import('/src/osm-city.js');
   const {project,createRailNetwork}=await import('/src/rail-network.js');
   const {createTraffic}=await import('/src/traffic.js');
   const data=await(await fetch('/data/kazan-map.geojson')).json(),started=performance.now();
   const city=detailed?buildGeographicCity(data):buildGeographicCity(data,[],[]);
   const scene=new T.Scene();scene.background=new T.Color('#d5e2db');scene.add(city.group);
   const traffic=createTraffic(data.features);scene.add(traffic.group);
   const sky=new T.HemisphereLight('#fff9e9','#66745e',2.7);scene.add(sky);
   const sun=new T.DirectionalLight('#ffedcb',3.3);sun.castShadow=detailed;sun.shadow.mapSize.set(1024,1024);
   Object.assign(sun.shadow.camera,{left:-230,right:230,top:230,bottom:-230,far:650});sun.shadow.bias=-.001;
   scene.add(sun,sun.target);
   const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,logarithmicDepthBuffer:true});
   renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
   renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;document.body.append(renderer.domElement);
   const camera=new T.PerspectiveCamera(42,innerWidth/innerHeight,.1,8000);
   const views={station:{point:[49.1002,55.7883],offset:[95,34,-20],height:8},hotel:{point:[49.0973,55.79328],offset:[-75,32,65],height:10},cab:{point:[49.1004914,55.7897916],offset:[0,2.8,0],height:2.6}};
   if(allRoutes){
    const network=createRailNetwork(data.features);
    for(const [id,coords,stopName] of [['karavaevo',[49.097,55.8607],'жилой массив Караваево'],['khalitova',[49.187,55.8275],'улица Халитова'],['sunny',[49.181,55.727],'жилой массив Солнечный город'],['chemical',[49.026,55.888],'Химическая улица']]){
     const stop=data.features.find(f=>f.properties.subclass==='tram_stop'&&f.properties.name===stopName);
     views[id]={projected:network.nodes[network.nearest(project(stop?.geometry.coordinates||coords))],offset:[65,28,80],height:8};
    }
   }
   window.preview={
    view(name){const v=views[name],p=v.projected||project(v.point);camera.position.set(p.x+v.offset[0],v.offset[1],p.z+v.offset[2]);
     camera.lookAt(p.x+(name==='cab'?-15:0),v.height,p.z+(name==='cab'?-50:0));
     if(detailed&&allRoutes)for(let i=0;i<100;i++){city.group.routeBuildings.update(camera,{budgetMs:Infinity,maxBuildings:1000});if(city.group.routeBuildings.stats.pendingChunks===0)break;}
     sun.position.set(p.x-130,240,p.z+120);sun.target.position.set(p.x,0,p.z);renderer.render(scene,camera);},
    async measure(){const times=[];for(let i=0;i<16;i++){await new Promise(requestAnimationFrame);const start=performance.now();traffic.update(.016);if(detailed&&allRoutes)city.group.routeBuildings.update(camera);renderer.render(scene,camera);renderer.getContext().finish();if(i>3)times.push(performance.now()-start);}times.sort((a,b)=>a-b);return {medianFrameMs:times[Math.floor(times.length/2)],drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,routeBuildings:{...city.group.routeBuildings.stats}};},
   };
   return {buildMs:performance.now()-started,...city.group.userData.stationDistrict,routeBuildings:{...city.group.routeBuildings.stats},routeRegistry:allRoutes?city.group.routeBuildings.tiles.flatMap(tile=>tile.buildings.map(b=>({key:b.key,center:b.center,base:Number(b.properties.render_min_height)||0,top:Number(b.properties.render_height)||9,source:'OpenStreetMap / OpenFreeMap / OpenMapTiles',facade:'procedural'}))):undefined};
  },{detailed,allRoutes});
  for(const [name] of cases){
   await page.evaluate(name=>window.preview.view(name),name);
   await page.screenshot({path:`${output}/${name}-${detailed?'after':'before'}.png`});
  }
  await page.evaluate(name=>window.preview.view(name),cases[0][0]);
  measurements[detailed?'after':'before']={buildMs:stats.buildMs,...await page.evaluate(()=>window.preview.measure())};
  if(detailed)await writeFile(`${output}/buildings.json`,JSON.stringify(stats,null,2));
 }
 if(errors.length)throw Error(errors.join('\n'));
 await writeFile(`${output}/performance.json`,JSON.stringify(measurements,null,2));
 await writeFile(`${output}/index.html`,`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Маршрут 5 · здания до и после</title><style>body{font:16px system-ui;max-width:1500px;margin:32px auto;padding:0 20px;background:#f4f5ee;color:#183b32}h1{font-size:28px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}img{width:100%;border-radius:12px}figure{margin:0}figcaption{margin:8px 0 24px}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style><h1>${allRoutes?'Здания всех маршрутов':'Маршрут № 5 · вокзальный квартал'}</h1><p>${allRoutes?'Процедурные фасады вдоль всей трамвайной сети.':'Первые 800 метров. Вокзал — приближение по фотографии; остальные фасады преимущественно процедурные.'} Снимки сделаны из одинаковых точек.</p>${cases.map(([id,title])=>`<h2>${title}</h2><div class="pair"><figure><img src="${id}-before.png"><figcaption>Объёмные контуры без фасадов</figcaption></figure><figure><img src="${id}-after.png"><figcaption>Новая версия</figcaption></figure></div>`).join('')}<p><a href="buildings.json">Реестр зданий и происхождение параметров</a> · <a href="performance.json">Замер сцены с трафиком в программном WebGL</a></p><p>Геометрия: © OpenStreetMap contributors · OpenFreeMap · OpenMapTiles.</p></html>`);
 console.log(JSON.stringify(measurements,null,2));
}finally{await browser.close();}
