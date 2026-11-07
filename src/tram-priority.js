import {sweptGap} from './clearance.js';

// Both player and background trams register through the same route control.
// Road vehicles reserve no priority: a car already on the rails clears them,
// while the tram waits for its actual footprint to leave the track.
export function createTramPriority(getCars){
 const trams=new Set();
 function sections(points){let start=0;return points.slice(1).flatMap((b,i)=>{
  const a=points[i],length=Math.hypot(b.x-a.x,b.z-a.z);if(!length)return [];
  const segment={a,length,start,dx:(b.x-a.x)/length,dz:(b.z-a.z)/length};start+=length;return [segment];
 });}
 function trajectory(path,distance,halfLength,horizon){
  const result=[];
  for(const s of path){if(s.start+s.length<distance||s.start>distance+horizon)continue;
   const local=Math.max(0,distance-s.start),offset=Math.max(0,s.start-distance);
   result.push({x:s.a.x+s.dx*local,z:s.a.z+s.dz*local,dx:s.dx,dz:s.dz,halfLength,halfWidth:1.6,offset,travel:Math.min(s.length-local,horizon-offset)});
  }
  return result;
 }
 function wrap(points,signals){
  const path=sections(points),state={body:null,reserved:[]};
  let waiting=null,recoveryUntil=-Infinity,lastDistance=0;
  function reset(){signals.reset();trams.delete(state);waiting=null;recoveryUntil=-Infinity;lastDistance=0;}
  function locate(distance,half){
   const ahead=trajectory(path,distance,half,45);state.body=ahead[0];
   state.reserved=ahead.map(s=>({...s,x:s.x+s.dx*s.travel/2,z:s.z+s.dz*s.travel/2,halfLength:s.halfLength+s.travel/2}));
   if(state.body)trams.add(state);
  }
  return {events:signals.events,locate,reset,
   limit(distance,half,time){
    if(distance<lastDistance-.01)reset();lastDistance=distance;
    locate(distance,half);let signal=signals.limit(distance,half,time),gap=Infinity;
    let blocker=null;
    const stoppedBlockers=new Set();
    const ahead=trajectory(path,distance,half,100),body=state.body;if(!body)return signal;
    const cars=getCars().filter(car=>Math.hypot(car.x-body.x,car.z-body.z)<150);
    for(const segment of ahead)for(const car of cars){
     const hit=sweptGap(segment,car,segment.dx,segment.dz,segment.travel,1);
     if(Number.isFinite(hit)&&car.speed<.1)stoppedBlockers.add(car.id);
     if(segment.offset+hit<gap){gap=segment.offset+hit;blocker=car;}
    }
    // Break a rule deadlock only after both vehicles have stopped for five
    // simulation seconds. Keep the exception until the tram's rear is clear,
    // otherwise it would stop again inside the same car on the next frame.
    if(distance>=recoveryUntil){
     recoveryUntil=-Infinity;
     signals.setDeadlockVehicles?.([],distance,distance);
     if(Math.min(gap,signal.distance)<=.5&&gap<=45&&blocker?.speed<.1){
      if(!waiting||Math.abs(distance-waiting.distance)>.25||time<waiting.time)waiting={distance,time};
      if(time-waiting.time>=5){recoveryUntil=distance+gap+2*half+2*blocker.halfLength+6;waiting=null;}
     }else waiting=null;
    }
    if(distance<recoveryUntil){
     // A stationary car on the crossing must not indefinitely suppress the
     // tram's scheduled green while that same car is being ignored for recovery.
     // Other occupants and the normal red/yellow timing still hold priority.
     signals.setDeadlockVehicles?.([...stoppedBlockers],distance,recoveryUntil);
     signal=signals.limit(distance,half,time);
     return signal.distance===Infinity?{...signal,reason:'deadlock'}:signal;
    }
    return gap<signal.distance?{distance:gap,color:'blocked',reason:'vehicle'}:signal;
   },advance(from,to,half,time){signals.advance(from,to,half,time);locate(to,half);},
  };
 }
 function carGap(body,path){
  let gap=Infinity,clearing=false;
  for(const tram of trams){
   if(Math.hypot(body.x-tram.body.x,body.z-tram.body.z)>180)continue;
   const inside=tram.reserved.some(r=>sweptGap(body,r,0,0,0,1.01)===0);
   clearing||=inside;
   const obstacles=inside?[tram.body]:tram.reserved;
   for(const obstacle of obstacles){
    // If initially overlapping (e.g. switching route), allow the car to exit.
    if(sweptGap(body,obstacle,0,0,0,-.05)===0)continue;
    for(const segment of path){
     gap=Math.min(gap,segment.offset+sweptGap(segment,obstacle,segment.dx,segment.dz,segment.travel,1));
    }
   }
  }
  return {gap,clearing};
 }
 return {wrap,carGap};
}
