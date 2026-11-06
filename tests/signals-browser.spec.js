import {test,expect} from '@playwright/test';

test('world connects tram braking, signal clock, pause and green departure',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('#map-label')).toContainText('OpenStreetMap',{timeout:45000});
 const result=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js');
  const {createWorld}=await import('/src/scene.js');
  const {createTraffic}=await import('/src/traffic.js');
  const {approachSignal}=await import('/src/traffic-signals.js');
  const {setGeographicNetwork,trams}=await import('/src/data.js');
  const {project}=await import('/src/rail-network.js');
  const coordinates=[[49.117,55.79],[49.12,55.79],[49.123,55.79]];
  const features=[coordinates,[[49.12,55.788],[49.12,55.79],[49.12,55.792]]].map(line=>({properties:{layer:'transportation',class:'primary'},geometry:{type:'LineString',coordinates:line}}));
  const traffic=createTraffic(features,{count:0,initialTime:30});
  const container=document.createElement('div');container.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;z-index:1000';document.body.append(container);
  const world=createWorld(container,e=>{throw e;});world.setTram(trams[1]);
  const city=new T.Group(),ground=new T.Mesh(new T.PlaneGeometry(1000,1000),new T.MeshStandardMaterial({color:'#9eac91'}));ground.rotation.x=-Math.PI/2;city.add(ground);
  const streetMaterial=new T.MeshStandardMaterial({color:'#737a76'});
  for(const turn of [0,Math.PI/2]){const road=new T.Mesh(new T.BoxGeometry(12,.1,700),streetMaterial);road.rotation.y=turn;road.position.y=.06;city.add(road);}
  world.setGeography(city,{x:0,z:0},traffic);
  setGeographicNetwork({path:()=>coordinates.map(project)});world.setRoute([0,1]);
  const stop=world.tramSignal(0).distance;
  let distance=stop-45,speed=10,slowed=false;
  const step=()=>{
   world.step(.1,false);const signal=world.tramSignal(distance);
   const move=approachSignal(speed,signal.distance,.1);if(move.speed<speed)slowed=true;speed=move.speed;
   const previous=distance;distance+=move.travel;world.advanceTram(previous,distance);
  };
  for(let i=0;i<180;i++)step();
  const waiting={distance,speed,gap:world.tramSignal(distance).distance};
  const pausedTime=traffic.time;world.step(10,true);const clockPaused=traffic.time===pausedTime;
  world.setCamera('cab');world.update(distance,false);
  // Capture the actual signal meshes and tram camera while waiting at red.
  await new Promise(resolve=>requestAnimationFrame(resolve));
  window.signalPreview={step,world,getDistance:()=>distance};
  return {slowed,waiting,stop,clockPaused};
 });
 expect(result.slowed).toBe(true);expect(result.waiting.speed).toBe(0);
 expect(result.waiting.distance).toBeCloseTo(result.stop);expect(result.waiting.gap).toBe(0);
 expect(result.clockPaused).toBe(true);
 await page.screenshot({path:'test-results/traffic-signals.png'});
 const resumed=await page.evaluate(()=>{const preview=window.signalPreview,before=preview.getDistance();for(let i=0;i<170;i++)preview.step();return preview.getDistance()>before+1;});
 expect(resumed).toBe(true);
 expect(errors).toEqual([]);
});
