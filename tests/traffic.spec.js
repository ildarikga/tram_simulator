import {test,expect} from '@playwright/test';

test('traffic follows mapped roads, respects direction and pauses',async({page})=>{
 await page.goto('/');
 await expect(page.locator('#map-label')).toContainText('OpenStreetMap',{timeout:45000});
 const result=await page.evaluate(async()=>{
  const {createTraffic,createRoadGraph}=await import('/src/traffic.js');
  const T=await import('/node_modules/three/build/three.module.js');
  const feature=(coordinates,extra={})=>({properties:{layer:'transportation',class:'primary',...extra},geometry:{type:'LineString',coordinates}});
  const features=[feature([[49.12,55.79],[49.12,55.795],[49.125,55.795]],{oneway:1}),feature([[49.12,55.79],[49.13,55.79]],{class:'path'})];
  const edges=createRoadGraph(features);
  let seed=25;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  const traffic=createTraffic(features,{count:60,random});
  const bodies=traffic.group.children.filter(m=>m.name.endsWith('-paint'));
  const before=bodies.map(m=>Array.from(m.instanceMatrix.array));
  traffic.update(0);const paused=bodies.every((m,i)=>m.instanceMatrix.array.every((n,j)=>n===before[i][j]));
  traffic.update(.1);let moved=0,onRoad=true,rightSide=true;
  for(const [index,mesh] of bodies.entries())for(let i=0;i<mesh.count;i++){
   const matrix=new T.Matrix4();mesh.getMatrixAt(i,matrix);const p=new T.Vector3().setFromMatrixPosition(matrix);
   if(Math.abs(p.x-before[index][i*16+12])+Math.abs(p.z-before[index][i*16+14])>.01)moved++;
   const distances=edges.map(e=>{const dx=(e.to.x-e.from.x)/e.length,dz=(e.to.z-e.from.z)/e.length;const along=(p.x-e.from.x)*dx+(p.z-e.from.z)*dz;return {distance:Math.abs((p.x-e.from.x)*dz-(p.z-e.from.z)*dx),along,e,side:(p.x-e.from.x)*(-dz)+(p.z-e.from.z)*dx};});
   const nearest=distances.sort((a,b)=>a.distance-b.distance)[0];
   onRoad&&=nearest.distance<3.1&&nearest.along>=-.01&&nearest.along<=nearest.e.length+.01;rightSide&&=nearest.side>0;
  }
  const colors=new Set(bodies.flatMap(m=>Array.from(m.instanceColor.array).map(n=>n.toFixed(3)).join(',').match(/[^,]+,[^,]+,[^,]+/g)));
  const summary={edges:edges.length,types:bodies.length,count:traffic.count,paused,moved,onRoad,rightSide,colors:colors.size};
  traffic.dispose();return summary;
 });
 expect(result).toMatchObject({edges:2,types:5,count:60,paused:true,onRoad:true,rightSide:true});
 // Dense traffic can queue behind another vehicle instead of moving every car.
 expect(result.moved).toBeGreaterThan(0);
 expect(result.colors).toBeGreaterThan(4);
});
