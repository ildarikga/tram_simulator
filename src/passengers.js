import * as T from 'three';

// Shared instanced geometry keeps crowds inexpensive even on the full city map.
export function createPassengers(stops){
 const group=new T.Group();group.name='Пассажиры остановок';group.ownedMaterials=[];
 const people=[],queues=stops.map((stop,index)=>{
  const waiting=[];
  for(let i=0;i<4+index%4;i++){
   const position=new T.Vector3(.35+(i%2)*.45,.35,-2.3+Math.floor(i/2)*1.25).applyAxisAngle(new T.Vector3(0,1,0),stop.angle||0).add(new T.Vector3(stop.x,0,stop.z));
   const person={position,home:position.clone(),angle:(stop.angle||0)+Math.PI/2,visible:true,id:people.length};people.push(person);waiting.push(person);
  }
  return {stop,waiting,served:false};
 });
 const initialCount=people.length,capacity=initialCount+stops.length*4,parts=[],dummy=new T.Object3D();
 const palette=['#c76b48','#386e91','#698451','#ad6384','#dbac4c','#4c595d'];
 function part(geometry,color,offset,leg=0){
  const material=new T.MeshStandardMaterial({color,roughness:.9});group.ownedMaterials.push(material);
  const mesh=new T.InstancedMesh(geometry,material,capacity);mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.frustumCulled=false;mesh.castShadow=true;group.add(mesh);parts.push({mesh,offset,leg});return mesh;
 }
 const body=part(new T.CylinderGeometry(.19,.23,.65,8),'#ffffff',.98);
 part(new T.SphereGeometry(.16,8,6),'#d6aa85',1.48);
 part(new T.BoxGeometry(.13,.62,.16),'#35424b',.34,-1);
 part(new T.BoxGeometry(.13,.62,.16),'#35424b',.34,1);
 for(let i=0;i<capacity;i++)body.setColorAt(i,new T.Color(palette[i%palette.length]));
 let jobs=[],onboard=6,boarded=0,alighted=0,current=null,time=0;
 function render(){
  for(const {mesh,offset,leg} of parts){
   mesh.count=people.length;
   for(const p of people){
    dummy.position.copy(p.position);dummy.position.y+=offset;
    dummy.rotation.set(p.moving?Math.sin(time*9+p.id)*.07:0,p.angle,0);
    if(leg){dummy.position.x+=Math.cos(p.angle)*leg*.105;dummy.position.z-=Math.sin(p.angle)*leg*.105;dummy.rotation.x=p.moving?Math.sin(time*9+p.id)*leg*.45:0;}
    dummy.scale.setScalar(p.visible?1:0);dummy.updateMatrix();mesh.setMatrixAt(p.id,dummy.matrix);
   }
   mesh.instanceMatrix.needsUpdate=true;
  }
 }
 function reset(){
  jobs=[];onboard=6;boarded=alighted=0;current=null;time=0;
  people.splice(initialCount);
  for(const q of queues){q.served=false;q.waiting=people.filter(p=>p.queue===q);}
  for(const p of people){p.position.copy(p.home);p.visible=true;p.moving=false;}
  render();
 }
 for(const q of queues)for(const p of q.waiting)p.queue=q;
 function begin(tram,q,doors){
  current=q;q.served=true;
  const world=(x,y,z)=>new T.Vector3(x,y,z).applyAxisAngle(new T.Vector3(0,1,0),tram.rotation.y).add(tram.position);
  const exiting=Math.min(onboard,2+queues.indexOf(q)%3);
  for(let i=0;i<exiting;i++){
   const z=doors[i%doors.length],position=world(-.8,.75,z);
   const person={position,home:position.clone(),id:people.length,visible:true,angle:tram.rotation.y-Math.PI/2};people.push(person);
   const end=q.waiting[i%q.waiting.length]?.home.clone()||new T.Vector3(q.stop.x,.35,q.stop.z);
   // Walk through the opening before turning along the platform.
   jobs.push({person,doorZ:z,points:[world(-2.5,.1,z),end],delay:Math.floor(i/doors.length)*1.2,exit:true});
  }
  q.waiting.forEach((person,i)=>{
   const z=doors[i%doors.length];
   jobs.push({person,doorZ:z,points:[world(-2.5,.1,z),world(-1.8,.3,z),world(-.8,.75,z)],delay:Math.floor(i/doors.length)*2,exit:false});
  });
 }
 render();
 return {group,reset,get busy(){return jobs.length>0;},get status(){return {onboard,boarded,alighted,waiting:queues.reduce((n,q)=>n+q.waiting.length,0),busy:jobs.length>0,stop:current?.stop.name||''};},
  update(tram,dt,open,stationary){
   if(!dt)return;time+=dt;
   if(open&&stationary&&!jobs.length){
    const doors=[];tram.traverse(o=>{if(o.userData.door&&o.userData.direction===1)doors.push(o.userData.closedZ-.295);});
    if(doors.length){
     const candidates=queues.filter(q=>!q.served).map(q=>({q,local:new T.Vector3(q.stop.x,0,q.stop.z).sub(tram.position).applyAxisAngle(new T.Vector3(0,1,0),-tram.rotation.y)}))
      .filter(({q,local})=>local.x< -2&&local.x> -18&&Math.abs(local.z)<5&&Math.cos((q.stop.angle||0)-tram.rotation.y)>.5)
      .sort((a,b)=>a.local.lengthSq()-b.local.lengthSq());
     if(candidates.length)begin(tram,candidates[0].q,doors);
    }
   }
   if(!jobs.length)return;
   if(open&&stationary)for(const job of [...jobs]){
    // Only wait for this doorway to clear, not for the walk to the shelter.
    if(!job.exit&&jobs.some(other=>other.exit&&other.doorZ===job.doorZ&&other.points.length===2))continue;
    if((job.delay-=dt)>0)continue;
    const p=job.person,target=job.points[0],delta=target.clone().sub(p.position),length=delta.length();p.moving=true;p.angle=Math.atan2(delta.x,delta.z);
    p.position.addScaledVector(delta,Math.min(1,dt*1.65/Math.max(length,.001)));
    if(length<.08){p.position.copy(target);job.points.shift();if(!job.points.length){
     p.moving=false;jobs.splice(jobs.indexOf(job),1);
     if(job.exit){onboard--;alighted++;}else{onboard++;boarded++;p.visible=false;current.waiting=current.waiting.filter(w=>w!==p);}
    }}
   }
   render();
  }
 };
}
