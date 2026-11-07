import {test,expect} from '@playwright/test';

test('passengers use open right-hand doors, pause and reset',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js');
  const {createPassengers}=await import('/src/passengers.js');
  const {makeTram,animateTramDoors}=await import('/src/scene.js');
  const {trams}=await import('/src/data.js');
  const tram=makeTram(trams[0]);tram.position.set(0,.25,0);
  const passengers=createPassengers([{name:'Test',x:-8,z:0,angle:0}]);
  const initial=passengers.status;
  passengers.update(tram,1,false,true);const closed=passengers.status;
  passengers.update(tram,1,true,false);const moving=passengers.status;
  animateTramDoors(tram,true,1);
  passengers.update(tram,.1,true,true);const started=passengers.status;
  const matrices=Array.from(passengers.group.children[0].instanceMatrix.array);
  passengers.update(tram,0,true,true);
  const frozen=matrices.every((v,i)=>v===passengers.group.children[0].instanceMatrix.array[i]);
  const waitingPosition=()=>Array.from(passengers.group.children[0].instanceMatrix.array.slice(12,15));
  const waitingStart=waitingPosition();
  for(let i=0;i<15;i++)passengers.update(tram,.05,true,true);
  const waitsForDoorway=waitingPosition().every((v,i)=>v===waitingStart[i]);
  let overlapping=false;
  for(let i=0;i<60;i++){
   passengers.update(tram,.05,true,true);
   if(passengers.status.alighted<2&&waitingPosition().some((v,j)=>v!==waitingStart[j]))overlapping=true;
  }
  for(let i=0;i<3000;i++)passengers.update(tram,.05,true,true);
  const complete=passengers.status;
  for(let i=0;i<100;i++)passengers.update(tram,.1,true,true);
  const repeated=passengers.status;
  passengers.reset();const reset=passengers.status;
  tram.rotation.y=Math.PI;passengers.update(tram,1,true,true);const wrongSide=passengers.status;
  tram.rotation.y=0;tram.position.z=50;passengers.update(tram,1,true,true);const away=passengers.status;
  return {initial,closed,moving,started,frozen,waitsForDoorway,overlapping,complete,repeated,reset,wrongSide,away};
 });
 expect(result.closed).toEqual(result.initial);expect(result.moving).toEqual(result.initial);
 expect(result.started.busy).toBe(true);expect(result.frozen).toBe(true);
 expect(result.waitsForDoorway).toBe(true);expect(result.overlapping).toBe(true);
 expect(result.complete).toMatchObject({busy:false,onboard:8,boarded:4,alighted:2,waiting:0});
 expect(result.repeated).toEqual(result.complete);expect(result.reset).toEqual(result.initial);
 expect(result.wrongSide).toEqual(result.initial);expect(result.away).toEqual(result.initial);
});
