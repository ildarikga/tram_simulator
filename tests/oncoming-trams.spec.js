import {test,expect} from '@playwright/test';
import {createOncomingTrams,opposingTrack} from '../src/oncoming-trams.js';
import {makeTram} from '../src/scene.js';
import {trams} from '../src/data.js';
import {createRoadGraph} from '../src/traffic.js';
import {createSignalNetwork,createRouteSignalControl} from '../src/traffic-signals.js';

const points=[{x:-100,z:0},{x:0,z:0},{x:300,z:0}];

test('opposing trams travel backwards on a separate track and pause with the simulation',()=>{
 const fleet=createOncomingTrams(points,{specs:trams,makeTram});
 expect(fleet.count).toBe(2);
 const initial=fleet.group.children.map(m=>m.position.clone());
 for(let i=0;i<40;i++)fleet.update(.1);
 fleet.group.children.forEach((model,i)=>{
  expect(model.position.x).toBeLessThan(initial[i].x);
  expect(model.position.z).toBeCloseTo(-4);
  expect(model.rotation.y).toBeCloseTo(-Math.PI/2);
 });
 const paused=fleet.group.children.map(m=>m.position.clone());fleet.update(0);
 fleet.group.children.forEach((m,i)=>expect(m.position.equals(paused[i])).toBe(true));
 fleet.dispose();expect(fleet.group.children).toHaveLength(0);
});

test('opposing trams stop on red, resume on green and release intersection occupancy',()=>{
 const coordinates=[[[49.117,55.79],[49.12,55.79],[49.123,55.79]],[[49.12,55.788],[49.12,55.79],[49.12,55.792]]];
 const features=coordinates.map(line=>({properties:{layer:'transportation',class:'primary'},geometry:{type:'LineString',coordinates:line}}));
 const network=createSignalNetwork(createRoadGraph(features));
 const fleet=createOncomingTrams(points,{specs:[trams[1]],makeTram,count:1,createRouteControl:route=>createRouteSignalControl(route,network)});
 const model=fleet.group.children[0];let time=30;
 for(let i=0;i<240;i++){time+=.1;fleet.update(.1,time);}
 expect(model.position.x).toBeCloseTo(18.3,1);
 const stopped=model.position.clone();for(let i=0;i<10;i++){time+=.1;fleet.update(.1,time);}
 expect(model.position.distanceTo(stopped)).toBeCloseTo(0);
 for(let i=0;i<130;i++){time+=.1;fleet.update(.1,time);}
 expect(model.position.x).toBeLessThan(stopped.x-10);
 fleet.dispose();expect(network.signals[0].occupants.size).toBe(0);
});

test('track corners stay connected, and trams keep separation after restarting at a terminus',()=>{
 const bent=opposingTrack([{x:0,z:0},{x:0,z:100},{x:100,z:100}]);
 expect(bent).toEqual([{x:100,z:96},{x:4,z:96},{x:4,z:0}]);
 const fleet=createOncomingTrams([{x:0,z:0},{x:1200,z:0}],{specs:trams,makeTram,count:6});
 for(let i=0;i<2000;i++){
  fleet.update(.1);
  if(i%50)continue;
  const models=[...fleet.group.children].sort((a,b)=>a.position.x-b.position.x);
  for(let j=1;j<models.length;j++)expect(models[j].position.x-models[j-1].position.x).toBeGreaterThan(models[j].userData.frontOffset+models[j-1].userData.frontOffset);
 }
 fleet.dispose();
});

test('oncoming tram is visible from the driving direction',async({page})=>{
 await page.goto('/');await expect(page.locator('#map-label')).toContainText('OpenStreetMap',{timeout:45000});
 const result=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js');
  const {createOncomingTrams}=await import('/src/oncoming-trams.js');
  const {makeTram}=await import('/src/scene.js');const {trams}=await import('/src/data.js');
  const fleet=createOncomingTrams([{x:0,z:-100},{x:0,z:200}],{specs:[trams[5]],makeTram,count:1});
  const before=fleet.group.children[0].position.z;for(let i=0;i<60;i++)fleet.update(.1);
  const after=fleet.group.children[0].position.z;
  const scene=new T.Scene();scene.background=new T.Color('#d5e2db');scene.add(fleet.group,new T.HemisphereLight('#fff9e9','#66745e',3));
  const sun=new T.DirectionalLight('#ffedcb',3);sun.position.set(-30,70,10);scene.add(sun);
  const ground=new T.Mesh(new T.PlaneGeometry(500,500),new T.MeshStandardMaterial({color:'#9aaa8c'}));ground.rotation.x=-Math.PI/2;scene.add(ground);
  const ballast=new T.Mesh(new T.BoxGeometry(9,.12,400),new T.MeshStandardMaterial({color:'#b0ada0'}));ballast.position.set(2,.05,0);scene.add(ballast);
  for(const center of [0,4])for(const side of [-1,1]){const rail=new T.Mesh(new T.BoxGeometry(.1,.12,400),new T.MeshStandardMaterial({color:'#677773',metalness:.5,roughness:.4}));rail.position.set(center+side*.76,.18,0);scene.add(rail);}
  const camera=new T.PerspectiveCamera(48,900/600,.1,800);camera.position.set(0,3,7);camera.lookAt(2,2.7,45);
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(900,600);renderer.render(scene,camera);
  const overlay=document.createElement('div');overlay.style.cssText='position:fixed;inset:0;background:#d5e2db;z-index:9999;display:grid;place-items:center';overlay.append(renderer.domElement);document.body.append(overlay);
  return {before,after};
 });
 expect(result.after).toBeLessThan(result.before);
 await page.screenshot({path:'test-results/oncoming-tram.png'});
});
