import assert from 'node:assert/strict';
import * as T from 'three';
import {makeTram,animateTramDoors} from '../src/scene.js';
import {trams} from '../src/data.js';
for(const spec of trams){
 const tram=makeTram(spec),leaves=[];tram.traverse(o=>{if(o.userData.door)leaves.push(o);});
 assert.equal(leaves.length,spec.doors*2,`${spec.id}: each doorway needs two leaves`);
 for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2]){
  tram.rotation.y=angle;tram.updateMatrixWorld(true);
  const forward=new T.Vector3(0,0,1).applyQuaternion(tram.quaternion),right=forward.clone().cross(new T.Vector3(0,1,0));
  for(const leaf of leaves)assert(leaf.getWorldPosition(new T.Vector3()).dot(right)>1.6,`${spec.id}: doors must be on driver's right at every heading`);
 }
 tram.rotation.y=0;tram.updateMatrixWorld(true);
 const center=(leaves[0].position.z+leaves[1].position.z)/2;
 const ray=new T.Raycaster(new T.Vector3(-3,2,center+.1),new T.Vector3(1,0,0));
 assert(ray.intersectObject(tram,true)[0].distance<1.5,'closed doorway blocks the entrance');
 const closed=leaves.map(o=>o.position.clone());animateTramDoors(tram,true,.15);
 assert(tram.userData.doorOpen>0&&tram.userData.doorOpen<1,'doors should animate smoothly');
 animateTramDoors(tram,true,1);tram.updateMatrixWorld(true);
 for(let i=0;i<leaves.length;i++){assert.equal(leaves[i].position.y,closed[i].y,'doors must never rise');assert(Math.abs(leaves[i].position.z-closed[i].z)>.6,'leaves slide along the body');}
 const hit=ray.intersectObject(tram,true)[0];assert(!hit||hit.distance>3,'open doorway must have a real opening, not a painted solid wall');
 animateTramDoors(tram,false,1);for(let i=0;i<leaves.length;i++)assert(leaves[i].position.distanceTo(closed[i])<1e-8,'doors return to closed positions');
 console.log('Verified right-side sliding doors and clear passage:',spec.id);
}
