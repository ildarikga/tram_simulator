import {test,expect} from '@playwright/test';
import {createTraffic} from '../src/traffic.js';
import {approachSignal,createRouteSignalControl,signalColor} from '../src/traffic-signals.js';
import {createTramPriority} from '../src/tram-priority.js';

test('a tram proceeds when a facing car and tram have stopped each other',()=>{
 const road={properties:{layer:'transportation',class:'primary',oneway:1},geometry:{type:'LineString',coordinates:[[49.117,55.79],[49.123,55.79]]}};
 let calls=0;const traffic=createTraffic([road],{count:1,random:()=>calls++===3?.5:0});
 const control=traffic.createRouteControl([{x:80,z:3},{x:-80,z:3}]);
 let distance=62,speed=0,recovered=false,waited=false;
 for(let i=0;i<200;i++){
  traffic.update(.1);
  const limit=control.limit(distance,12,traffic.time);
  waited||=limit.reason==='vehicle'&&limit.distance<.1;
  recovered||=limit.reason==='deadlock';
  const move=approachSignal(speed,limit.distance,.1,{maxSpeed:5});
  control.advance(distance,distance+move.travel,12,traffic.time);
  speed=move.speed;distance+=move.travel;
 }
 expect(waited).toBe(true);expect(recovered).toBe(true);
 expect(distance).toBeGreaterThan(90);
 traffic.dispose();
});

function fixture(){
 const car={id:{},x:0,z:3,dx:1,dz:0,halfLength:2.25,halfWidth:.9,speed:0};
 const signal={offset:0,radius:10,occupants:new Map()};
 const points=[{x:0,z:100},{x:0,z:-100}];
 const network={eventsForSegment:()=>[{signal,axis:1,at:106}]};
 const control=createTramPriority(()=>[car]).wrap(points,createRouteSignalControl(points,network));
 return {car,control,signal};
}

test('deadlock recovery obeys red and yellow signals and only departs on green',()=>{
 const {control,signal}=fixture();
 // The tram is simultaneously held by a car and a red signal.
 expect(control.limit(83,12,0).distance).toBe(0);
 expect(control.limit(83,12,4.9).reason).not.toBe('deadlock');
 expect(control.limit(83,12,5)).toMatchObject({distance:0,color:'red'});
 expect(control.limit(83,12,54)).toMatchObject({distance:0,color:'yellow'});
 expect(control.limit(83,12,60)).toMatchObject({distance:0,color:'red'});
 expect(control.limit(83,12,90)).toMatchObject({distance:Infinity,reason:'deadlock'});
 control.advance(83,84,12,90);
 expect(signalColor(signal,0,95)).toBe('red');
 expect(control.limit(84,12,95).distance).toBe(Infinity);
 expect(control.limit(130,12,96).reason).not.toBe('deadlock');
 control.reset();
 expect(control.limit(83,12,97).reason).not.toBe('deadlock');
 expect(signal.occupants.size).toBe(0);
});

test('paused time, a moving car and a tram still advancing do not trigger recovery',()=>{
 const {car,control}=fixture();
 for(let i=0;i<100;i++)expect(control.limit(83,12,0).reason).not.toBe('deadlock');
 car.speed=1;
 expect(control.limit(83,12,10).reason).not.toBe('deadlock');
 car.speed=0;
 expect(control.limit(83,12,11).reason).not.toBe('deadlock');
 expect(control.limit(84,12,15).reason).not.toBe('deadlock');
 expect(control.limit(84,12,19).reason).not.toBe('deadlock');
});

test('a stopped crossing car cannot hold the tram signal red forever during deadlock recovery',()=>{
 const {car,control,signal}=fixture();
 signal.occupants.set(car.id,0);
 // The normal tram green at t=30 is held red by this immobile car.
 expect(signalColor(signal,1,30)).toBe('red');
 expect(control.limit(83,12,30).distance).toBe(0);
 const recovered=control.limit(83,12,35);
 expect(signalColor(signal,1,35)).toBe('green');
 expect(recovered).toMatchObject({distance:Infinity,reason:'deadlock'});
 // Normal yellow/red phases still stop the tram while the car is ignored.
 expect(control.limit(83,12,54)).toMatchObject({distance:0,color:'yellow'});
 expect(control.limit(83,12,60)).toMatchObject({distance:0,color:'red'});
 control.reset();expect(signalColor(signal,1,90)).toBe('red');
});

test('waiting at the stop line detects a blocked car farther ahead and preserves other crossing traffic',()=>{
 const {car,control,signal}=fixture();car.z=-1;
 const movingCar={};signal.occupants.set(car.id,0);signal.occupants.set(movingCar,0);
 expect(control.limit(83,12,30).distance).toBe(0);
 expect(control.limit(83,12,35).distance).toBe(0);
 signal.occupants.delete(movingCar);
 expect(control.limit(83,12,36)).toMatchObject({distance:Infinity,reason:'deadlock'});
});
