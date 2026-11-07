// Continuous separating-axis test for two oriented footprints in the X/Z plane.
// Returns the first travel distance at which their safety envelopes meet.
export function sweptGap(a,b,dx=0,dz=0,travel=0,margin=0){
 let enter=0,exit=travel;
 for(const [x,z] of [[a.dx,a.dz],[-a.dz,a.dx],[b.dx,b.dz],[-b.dz,b.dx]]){
  const radius=r=>Math.abs(x*r.dx+z*r.dz)*r.halfLength+Math.abs(-x*r.dz+z*r.dx)*r.halfWidth;
  const reach=radius(a)+radius(b)+margin,offset=(a.x-b.x)*x+(a.z-b.z)*z,speed=dx*x+dz*z;
  if(Math.abs(speed)<1e-9){if(Math.abs(offset)>reach)return Infinity;continue;}
  let lo=(-reach-offset)/speed,hi=(reach-offset)/speed;if(lo>hi)[lo,hi]=[hi,lo];
  enter=Math.max(enter,lo);exit=Math.min(exit,hi);if(enter>exit)return Infinity;
 }
 return enter;
}

// Reserve the neighbouring opposing track as well as mapped rail centre lines.
// Index segments once: stop/signal placement must not scan the entire city.
export function railClearance(features){
 const bins=new Map(),cell=50;
 for(const line of features){for(let i=1;i<line.length;i++){
  const a=line[i-1],b=line[i],length=Math.hypot(b.x-a.x,b.z-a.z);if(!length)continue;
  const rail={x:(a.x+b.x)/2,z:(a.z+b.z)/2,dx:(b.x-a.x)/length,dz:(b.z-a.z)/length,halfLength:length/2,halfWidth:6};
  for(let x=Math.floor((Math.min(a.x,b.x)-7)/cell);x<=Math.floor((Math.max(a.x,b.x)+7)/cell);x++)for(let z=Math.floor((Math.min(a.z,b.z)-7)/cell);z<=Math.floor((Math.max(a.z,b.z)+7)/cell);z++){
   const key=`${x},${z}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(rail);
  }
 }}
 return body=>{
  const radius=Math.hypot(body.halfLength,body.halfWidth),found=new Set();
  for(let x=Math.floor((body.x-radius)/cell);x<=Math.floor((body.x+radius)/cell);x++)for(let z=Math.floor((body.z-radius)/cell);z<=Math.floor((body.z+radius)/cell);z++)for(const rail of bins.get(`${x},${z}`)||[])found.add(rail);
  return [...found].every(rail=>sweptGap(body,rail,0,0,0,.3)===Infinity);
 };
}

export function placeBesideRails(point,angle,clear,{halfLength=.5,halfWidth=.5}={}){
 const dx=Math.sin(angle),dz=Math.cos(angle);
 for(let distance=0;distance<=100;distance+=1){
  const offsets=distance?[[1,0],[-1,0],[Math.SQRT1_2,Math.SQRT1_2],[Math.SQRT1_2,-Math.SQRT1_2],[-Math.SQRT1_2,Math.SQRT1_2],[-Math.SQRT1_2,-Math.SQRT1_2]]:[[0,0]];
  for(const [side,along] of offsets){
   const candidate={x:point.x+(-dz*side+dx*along)*distance,z:point.z+(dx*side+dz*along)*distance,dx,dz,halfLength,halfWidth};
   if(clear(candidate))return {...candidate,angle:side>=0?angle:angle+Math.PI};
  }
 }
 // Dense rail yards have no safe roadside position: omit the physical fixture.
 return null;
}
