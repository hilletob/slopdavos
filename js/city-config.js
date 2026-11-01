import { GEO } from './nyc-geodata.js';
import { lonLatToWorld, lv95ToWorld } from './davos-frame.js';
import { streetCorners, inCornerCut } from './street-corners.js';

// Davos spatial adapter for mrdoob/slop-newyork's engine (via colorfield/slop-zurich and the irregular-city data path of
// the Slop Berlin, Warsaw and Utrecht forks). Legacy export names are retained as API aliases; all visible geography is Davos.
// 1 unit = 1 metre, x = LV95 east, z = LV95 south (grid north up), origin on the Promenade between Davos Platz and the
// Kongresszentrum (js/davos-frame.js).
const BERLIN_DATA = GEO.berlin;
const toPts = (flat) => { const out=[]; for(let i=0;i<flat.length;i+=2)out.push({x:flat[i],z:flat[i+1]});return out; };
// Exact WGS84 -> LV95 (js/swiss-projection.js)
const projectLonLat = (lon,lat) => lonLatToWorld(lon,lat);
const [minX,minZ,maxX,maxZ] = BERLIN_DATA.meta.bounds;
const ISLAND_BOUNDS = {minX,maxX,minZ,maxZ,sidewalkHeight:0.22,waterLevel:-2.2};
const CUT_Z=minZ;
const MANHATTAN_COASTLINE=toPts(GEO.manhattan);
const getIslandBoundsAtZ=()=>({westX:minX,eastX:maxX});
// Davos has an arbitrary mapped street network. Empty legacy grid registries prevent
// the original corridor builder from inventing axis-aligned Manhattan streets.
const AVENUES=[], ALL_AVENUES=[], STREETS=[], ALL_STREETS=[];
const BROADWAY_LINE=[];
const getBroadwayX=()=>0;
const WATERFRONT_PIERS=[], EAST_RIVER_BRIDGES=[], OUTER_BRIDGES=[];
const ROOSEVELT_ISLAND_POLYGON=[],GOVERNORS_ISLAND_POLYGON=[],NJ_SHORELINE_POLYGON=[],LONG_ISLAND_POLYGON=[],LONG_ISLAND_POLYGONS=[],BROOKLYN_POLYGONS=[],QUEENS_POLYGONS=[],BRONX_POLYGONS=[],WESTCHESTER_POLYGON=[],NASSAU_POLYGON=[],UPPER_MANHATTAN_POLYGON=[],BRONX_POLYGON=[],STATEN_ISLAND_POLYGON=[],RANDALLS_ISLAND_POLYGON=[],LIBERTY_ISLAND_POLYGON=[],ELLIS_ISLAND_POLYGON=[],MILL_ROCK_POLYGON=[];
const LIBERTY_STATUE_POS={x:0,z:0};
// The legacy park bounds describe a raised Central Park lawn: Davos has none.
const CENTRAL_PARK_BOUNDS={minX:-99999,maxX:-99998,minZ:-99999,maxZ:-99998};
const ROADS=BERLIN_DATA.roads.filter(r=>!r.tunnel).map(r=>({...r,raw:r.name,name:r.name||`Unnamed ${r.kind}`,w:r.width,dir:r.oneway?(r.reverse?-1:1):0,highway:/motorway|trunk/.test(r.kind),pts:toPts(r.pts)}));
const DRIVABLE=new Set(['motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','residential','unclassified','living_street']);
const ROAD_DRIVING=ROADS.filter(r=>DRIVABLE.has(r.kind));
const BERLIN_AREAS=(BERLIN_DATA.meta.areas||[]).map(a=>({...a,polygons:(a.polygons||[]).map(p=>({
 poly:toPts(p.ring),holes:(p.holes||[]).map(toPts)
}))}));
// Areas (the municipality, Ortsteile where mapped) from the official boundaries in OSM; bounding boxes keep the polygon tests rare.
for(const a of BERLIN_AREAS){
 a.minX=Infinity;a.maxX=-Infinity;a.minZ=Infinity;a.maxZ=-Infinity;
 for(const p of a.polygons)for(const q of p.poly){a.minX=Math.min(a.minX,q.x);a.maxX=Math.max(a.maxX,q.x);a.minZ=Math.min(a.minZ,q.z);a.maxZ=Math.max(a.maxZ,q.z);}
}
function districtAt(x,z){
 for(const a of BERLIN_AREAS){
  if(x<a.minX||x>a.maxX||z<a.minZ||z>a.maxZ)continue;
  if(a.polygons.some(p=>pointInPoly(p.poly,x,z)&&!p.holes.some(h=>pointInPoly(h,x,z))))return a.id;
 }
 return 'city';
}
function makeBlock(b,id,park=0){
 const poly=toPts(b.ring),holes=(b.holes||[]).map(toPts);
 let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,a=0,cx=0,cz=0;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const p=poly[i],q=poly[j],c=q.x*p.z-p.x*q.z;
  minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);a+=c;cx+=(q.x+p.x)*c;cz+=(q.z+p.z)*c;
 }
 a*=.5;cx=a?cx/(6*a):(minX+maxX)/2;cz=a?cz/(6*a):(minZ+maxZ)/2;
 return {id,osmId:b.id,poly,holes,rects:[],frames:null,park,parkName:park?b.name:'',rect:false,area:Math.abs(a),minX,maxX,minZ,maxZ,cx,cz,median:false,district:districtAt(cx,cz)};
}
const BLOCKS=[...BERLIN_DATA.buildings.filter(b=>!b.part).map((b,i)=>makeBlock(b,i)),...BERLIN_DATA.parks.map((b,i)=>makeBlock(b,'park:'+i,1))];
const LANDMARK_BLOCKS=new Set();
const LANDMARK_SITES=GEO.landmarks;
function getBlockBounds(col,row){return BLOCKS[Number.isInteger(col)?col:0]||{minX:0,maxX:0,minZ:0,maxZ:0,cx:0,cz:0,width:0,depth:0};}
const avenueNameAt=(a)=>a?.short||a?.name||'';
const avenueX=()=>0;
const fromOldFrame=(x,z)=>({x,z});
// Nearest-road index (labels, sidewalk tests): uniform grid of road segments
const ROAD_CELL = 64;
const ROAD_GRID = new Map();
for (const r of ROADS) {
  for (let i = 0; i + 1 < r.pts.length; i++) {
    const a = r.pts[i];
    const b = r.pts[i + 1];
    const seg = { r, ax: a.x, az: a.z, bx: b.x, bz: b.z };
    const ix0 = Math.floor(Math.min(a.x, b.x) / ROAD_CELL), ix1 = Math.floor(Math.max(a.x, b.x) / ROAD_CELL);
    const iz0 = Math.floor(Math.min(a.z, b.z) / ROAD_CELL), iz1 = Math.floor(Math.max(a.z, b.z) / ROAD_CELL);
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const k = ix * 100000 + iz;
      if (!ROAD_GRID.has(k)) ROAD_GRID.set(k, []);
      ROAD_GRID.get(k).push(seg);
    }
  }
}
/** Nearest roads to (x, z) within `radius`: [{ road, dist }] sorted by distance (one entry per road name) */
function nearestRoads(x, z, radius = 60) {
  const best = new Map();
  const ix0 = Math.floor((x - radius) / ROAD_CELL), ix1 = Math.floor((x + radius) / ROAD_CELL);
  const iz0 = Math.floor((z - radius) / ROAD_CELL), iz1 = Math.floor((z + radius) / ROAD_CELL);
  for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
    const list = ROAD_GRID.get(ix * 100000 + iz);
    if (!list) continue;
    for (const s of list) {
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const L2 = dx * dx + dz * dz || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2));
      const d = Math.hypot(s.ax + t * dx - x, s.az + t * dz - z);
      if (d > radius) continue;
      const prev = best.get(s.r.name);
      if (!prev || d < prev.dist) best.set(s.r.name, { road: s.r, dist: d, horizontal: Math.abs(dx) > Math.abs(dz) });
    }
  }
  return [...best.values()].sort((a, b) => a.dist - b.dist);
}

/**
 * Whether some road segment lies within `radius` of (x, z) and nearer than its road's half width + `margin` (Infinity:
 * any road within `radius`), without allocating: nearestRoads(x, z, radius).some(q => q.dist < q.road.w / 2 + margin)
 * can only hold where this does.
 */
function roadCloserThan(x, z, radius, margin) {
  const ix0 = Math.floor((x - radius) / ROAD_CELL), ix1 = Math.floor((x + radius) / ROAD_CELL);
  const iz0 = Math.floor((z - radius) / ROAD_CELL), iz1 = Math.floor((z + radius) / ROAD_CELL);
  for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
    const list = ROAD_GRID.get(ix * 100000 + iz);
    if (!list) continue;
    for (const s of list) {
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const L2 = dx * dx + dz * dz || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2));
      const ex = s.ax + t * dx - x, ez = s.az + t * dz - z, d = Math.sqrt(ex * ex + ez * ez);
      if (d - 1e-9 <= radius && d - 1e-9 < s.r.w / 2 + margin) return true; // (a hair generous: hypot vs sqrt)
    }
  }
  return false;
}

// Spatial index of the blocks (64 m cells)
const BLOCK_CELL = 64;
const BLOCK_GRID = new Map();
for (const b of BLOCKS) {
  for (let ix = Math.floor(b.minX / BLOCK_CELL); ix <= Math.floor(b.maxX / BLOCK_CELL); ix++) {
    for (let iz = Math.floor(b.minZ / BLOCK_CELL); iz <= Math.floor(b.maxZ / BLOCK_CELL); iz++) {
      const k = ix * 100000 + iz;
      if (!BLOCK_GRID.has(k)) BLOCK_GRID.set(k, []);
      BLOCK_GRID.get(k).push(b);
    }
  }
}
function pointInPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
// The raised sidewalks along the streets (roads[].sidewalk [left, right] widths, drawn by js/city-grid.js from the curb
// out): each a strip per piece of the way and side, the strips that touch joined into one sidewalk "block" (stable, with
// an outline), so that the pedestrians' tracks (js/pedestrian-routes.js) keep to them and link up along them
const RAISED_CELL = 16;
const RAISED_GRID = new Map();
{
  const strips = [];
  for (const r of ROADS) {
    if (!r.sidewalk || r.bridge) continue;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i], b = r.pts[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.2) continue;
      const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len, nx = -uz, nz = ux;
      r.sidewalk.forEach((w, k) => {
        if (!w) return;
        const side = k ? 1 : -1, o0 = side * (r.w / 2 + 0.12), o1 = side * (r.w / 2 + 0.12 + w), e = 0.3;
        const P = (t, o) => ({ x: a.x + ux * t + nx * o, z: a.z + uz * t + nz * o });
        const poly = [P(-e, o0), P(len + e, o0), P(len + e, o1), P(-e, o1)];
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const p of poly) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
        strips.push({ poly, minX, maxX, minZ, maxZ, parent: strips.length });
      });
    }
  }
  const find = (s) => (strips[s].parent === s ? s : (strips[s].parent = find(strips[s].parent)));
  for (const [i, s] of strips.entries()) {
    for (let ix = Math.floor(s.minX / RAISED_CELL); ix <= Math.floor(s.maxX / RAISED_CELL); ix++) {
      for (let iz = Math.floor(s.minZ / RAISED_CELL); iz <= Math.floor(s.maxZ / RAISED_CELL); iz++) {
        const k = ix * 100000 + iz;
        if (!RAISED_GRID.has(k)) RAISED_GRID.set(k, []);
        const list = RAISED_GRID.get(k);
        // (touching strips: a corner of one inside the other)
        for (const j of list) {
          const t = strips[j];
          if (t.maxX < s.minX || t.minX > s.maxX || t.maxZ < s.minZ || t.minZ > s.maxZ) continue;
          if (s.poly.some((p) => pointInPoly(t.poly, p.x, p.z)) || t.poly.some((p) => pointInPoly(s.poly, p.x, p.z))) strips[find(i)].parent = find(j);
        }
        list.push(i);
      }
    }
  }
  const blocks = new Map();
  for (const [i, s] of strips.entries()) {
    const root = find(i);
    if (!blocks.has(root)) blocks.set(root, { id: `sidewalk:raised:${root}`, sidewalk: true, raised: true, park: 0, median: false, poly: [], holes: [], cx: s.poly[0].x, cz: s.poly[0].z, district: 'city' });
    const block = blocks.get(root);
    block.poly.push(...s.poly);
    s.block = block;
  }
  for (const block of blocks.values()) block.district = districtAt(block.cx, block.cz);
  for (const [k, list] of RAISED_GRID) RAISED_GRID.set(k, list.map((i) => strips[i]));
}
// The rounded corners of the streets (js/street-corners.js): the asphalt reaches round them, the sidewalks end at their arcs
const cornerCut = (x, z) => inCornerCut(streetCorners(BERLIN_DATA.roads), x, z);
/** The raised sidewalk block under (x, z), or null (never on a carriageway: junctions, driveways, rounded corners) */
function raisedSidewalkAt(x, z) {
  const list = RAISED_GRID.get(Math.floor(x / RAISED_CELL) * 100000 + Math.floor(z / RAISED_CELL));
  if (!list) return null;
  for (const s of list) {
    if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ || !pointInPoly(s.poly, x, z)) continue;
    if (nearestRoads(x, z, 24).some((q) => !PEDESTRIAN_KINDS.has(q.road.kind) && q.dist < q.road.w / 2)) return null;
    if (cornerCut(x, z)) return null;
    return s.block;
  }
  return null;
}
/** The block (curb island) under (x, z), or null on the roadway / in the water */
function blockAt(x, z) {
  const raised = raisedSidewalkAt(x, z);
  if (raised) return raised;
  const list = BLOCK_GRID.get(Math.floor(x / BLOCK_CELL) * 100000 + Math.floor(z / BLOCK_CELL));
  for (const b of list || []) {
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    if ((b.rect || pointInPoly(b.poly, x, z)) && !b.holes.some(h=>pointInPoly(h,x,z))) return b;
  }
  return sidewalkAt(x,z);
}
const PEDESTRIAN_KINDS=new Set(['footway','pedestrian','path','cycleway','steps']);
function sidewalkAt(x,z){
  // (no road within reach: never a sidewalk; the woods' 240,000 tree sites ask, nearestRoads allocates its answer)
  if(!roadCloserThan(x,z,24,Infinity))return null;
  const near=nearestRoads(x,z,24);
  if(waterAt(x,z)&&!near.some(q=>q.road.bridge&&q.dist<q.road.w/2+3))return null;
  // On a carriageway is never on a sidewalk, whatever the curbs of the streets around (junctions) or a footway
  // mapped over it, nor on the asphalt round a rounded corner
  if(near.some(q=>!PEDESTRIAN_KINDS.has(q.road.kind)&&q.dist<q.road.w/2-0.4))return null;
  if(cornerCut(x,z))return null;
  for(const q of near){
    const r=q.road, pedestrian=PEDESTRIAN_KINDS.has(r.kind);
    if((pedestrian&&q.dist<=r.w/2)||(!pedestrian&&q.dist>=r.w/2-.4&&q.dist<=r.w/2+5.5))return {id:'sidewalk:'+r.id,sidewalk:true,park:0,median:false,cx:x,cz:z,district:districtAt(x,z)};
  }
  return null;
}
/** Blocks whose bounds overlap a rectangle */
function blocksInRect(minX, maxX, minZ, maxZ) {
  const out = new Set();
  for (let ix = Math.floor(minX / BLOCK_CELL); ix <= Math.floor(maxX / BLOCK_CELL); ix++) {
    for (let iz = Math.floor(minZ / BLOCK_CELL); iz <= Math.floor(maxZ / BLOCK_CELL); iz++) {
      const list = BLOCK_GRID.get(ix * 100000 + iz);
      if (list) for (const b of list) if (b.maxX > minX && b.minX < maxX && b.maxZ > minZ && b.minZ < maxZ) out.add(b);
    }
  }
  return [...out];
}


const WATER_POLYGONS=BERLIN_DATA.water.map(w=>{const poly=toPts(w.ring);return {...w,poly,inner:(w.holes||[]).map(toPts),minX:Math.min(...poly.map(p=>p.x)),maxX:Math.max(...poly.map(p=>p.x)),minZ:Math.min(...poly.map(p=>p.z)),maxZ:Math.max(...poly.map(p=>p.z))};});
function waterAtExact(x,z){return WATER_POLYGONS.some(w=>x>=w.minX&&x<=w.maxX&&z>=w.minZ&&z<=w.maxZ&&pointInPoly(w.poly,x,z)&&!w.inner.some(h=>pointInPoly(h,x,z)));}
// The Davosersee, the Landwasser and the mountain streams are mapped water polygons, and traffic calls waterAt many times per frame.
// A 4 m grid (scanline even-odd fill) answers inside/outside; only cells crossed by a shoreline use the exact test.
const WATER_CELL=4, WNX=Math.ceil((maxX-minX)/WATER_CELL), WNZ=Math.ceil((maxZ-minZ)/WATER_CELL);
// (2 bits a cell, four cells a byte: 0 dry, 1 water, 2 shoreline; 2 MB instead of 8)
const WATER_GRID=new Uint8Array(Math.ceil(WNX*WNZ/4));
const waterCellSet=(k,v)=>{const s=(k&3)*2;WATER_GRID[k>>2]=(WATER_GRID[k>>2]&~(3<<s))|(v<<s);};
const waterCell=(k)=>(WATER_GRID[k>>2]>>((k&3)*2))&3;
{
 const rings=[];for(const w of WATER_POLYGONS){rings.push(w.poly,...w.inner);}
 const xs=[];
 for(let j=0;j<WNZ;j++){
  const zc=minZ+(j+.5)*WATER_CELL;xs.length=0;
  for(const r of rings)for(let i=0,k=r.length-1;i<r.length;k=i++){const a=r[i],b=r[k];if((a.z>zc)!==(b.z>zc))xs.push(a.x+(zc-a.z)*(b.x-a.x)/(b.z-a.z));}
  xs.sort((p,q)=>p-q);
  for(let t=0;t+1<xs.length;t+=2){const i0=Math.max(0,Math.ceil((xs[t]-minX)/WATER_CELL-.5)),i1=Math.min(WNX-1,Math.floor((xs[t+1]-minX)/WATER_CELL-.5));for(let i=i0;i<=i1;i++)waterCellSet(j*WNX+i,1);}
 }
 const WATER_NEIGHBOURS=[[0,0],[1,0],[-1,0],[0,1],[0,-1]]; // (one list, not one per metre of shore)
 for(const r of rings)for(let i=0,k=r.length-1;i<r.length;k=i++){
  const a=r[i],b=r[k],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/1));
  for(let t=0;t<=n;t++){const x=a.x+(b.x-a.x)*t/n,z=a.z+(b.z-a.z)*t/n;
   for(const [dx,dz] of WATER_NEIGHBOURS){const gi=Math.floor((x-minX)/WATER_CELL)+dx,gj=Math.floor((z-minZ)/WATER_CELL)+dz;if(gi>=0&&gj>=0&&gi<WNX&&gj<WNZ)waterCellSet(gj*WNX+gi,2);}}
 }
}
function waterAt(x,z){
 const gi=Math.floor((x-minX)/WATER_CELL),gj=Math.floor((z-minZ)/WATER_CELL);
 if(gi<0||gj<0||gi>=WNX||gj>=WNZ)return waterAtExact(x,z);
 const v=waterCell(gj*WNX+gi);return v===2?waterAtExact(x,z):v===1;
}
function nearestDrivingPoint(x,z,name=null){
 let best=null,dist=Infinity;
 for(const r of ROAD_DRIVING.filter(r=>!name||r.name===name))for(let i=0;i+1<r.pts.length;i++){
  const a=r.pts[i],b=r.pts[i+1],dx=b.x-a.x,dz=b.z-a.z,L2=dx*dx+dz*dz;if(L2<1)continue;
  const t=Math.max(0.02,Math.min(.98,((x-a.x)*dx+(z-a.z)*dz)/L2)),px=a.x+t*dx,pz=a.z+t*dz,d=Math.hypot(px-x,pz-z);
  if(d<dist){dist=d;const sign=r.dir<0?-1:1;best={x:px,z:pz,heading:Math.atan2(dx*sign,dz*sign),road:r};}
 }
 return best;
}
function arrivalAt(p,name=null){const q=nearestDrivingPoint(p.x,p.z,name)||(name&&nearestDrivingPoint(p.x,p.z));return q?{x:q.x,z:q.z,heading:q.heading}:{...p,heading:0};}
function arrival(lon,lat,name=null){return arrivalAt(projectLonLat(lon,lat),name);}
// The start: on the Promenade in Davos Platz between the Eisstadion and the Kirchner Museum, riding along the one-way
// street towards the Schatzalpbahn and the centre of Davos Platz, the Jakobshorn ahead across the valley
const spawnPoint=lv95ToWorld(2782080,1185738);
const defaultSpawn=arrivalAt(spawnPoint,'Promenade');
// Keep to the right of the carriageway, clear of the kerb furniture
defaultSpawn.x-=Math.cos(defaultSpawn.heading)*1.8;defaultSpawn.z+=Math.sin(defaultSpawn.heading)*1.8;defaultSpawn.name='Promenade';
// Legacy material code samples ordered district bands through streetZ; keep distinct thresholds.
const streetZ=(n=37)=>defaultSpawn.z+(37-Number(n))*25;
// Teleport destinations: [id, name, short label, LV95 east, LV95 north, Ortsteil, street to arrive on (exact OSM name, or
// null for the nearest drivable street), mapped landmark to face (LANDMARK_SITES, from its OSM footprint) or none]
const NYC_LANDMARKS=[
 ['platz','Bahnhof Davos Platz','Davos Platz',2781839,1185061,'Davos Platz','Talstrasse',null],
 ['spital','Spital Davos · Rega-Landeplatz','Spital',2781361,1184575,'Davos Platz','Promenade',null], // (the pad on the roof, js/helipad.js)
 ['promenade','Promenade · Davos Platz','Promenade',2781944,1185672,'Davos Platz','Promenade',null],
 ['schatzalp','Schatzalpbahn','Schatzalp',2781892,1185647,'Davos Platz','Promenade','Schatzalpbahn Talstation'],
 ['eisstadion','Eisstadion · Vaillant Arena','Eisstadion',2782255,1185816,'Davos Platz','Eisbahnstrasse','Eisstadion Davos'],
 ['kirchner','Kirchner Museum','Kirchner',2782276,1185991,'Davos Platz','Promenade','Kirchner Museum'],
 ['kongress','Kongresszentrum','Kongress',2782631,1186090,'Davos Platz','Promenade','Kongresszentrum'],
 ['jakobshorn','Talstation Jakobshornbahn','Jakobshorn',2781982,1184825,'Davos Platz','Skistrasse',null],
 ['parsenn','Talstation Parsennbahn','Parsenn',2783145,1186937,'Davos Dorf','Promenade',null],
 ['dorf','Bahnhof Davos Dorf','Davos Dorf',2783393,1187097,'Davos Dorf','Bahnhofstrasse',null],
 ['see','Davosersee · Strandbad','Davosersee',2784149,1187714,'Davos Dorf',null,null],
 ['frauenkirch','Frauenkirch','Frauenkirch',2780246,1182443,'Frauenkirch','Landwasserstrasse','Frauenkirch'],
 ['teufi','Dischma · Teufi','Teufi',2786574,1182992,'Dischma','Dischmastrasse',null],
 ['duerrboden','Dürrboden','Dürrboden',2789560,1177880,'Dischma','Dischmastrasse',null],
].map(([id,name,short,E,N,district,road,landmark])=>{
 const site=landmark&&LANDMARK_SITES[landmark];
 return {id,name,short,...(site?{x:site.x,z:site.z}:lv95ToWorld(E,N)),district,road,E,N};
});
// The Davosersee's extent (LV95 2783650-2784740 E, 1187640-1188830 N) names the water the player stands on
const LAKE_SW=lv95ToWorld(2783600,1187450),LAKE_NE=lv95ToWorld(2784800,1188900);
const TELEPORT_LOCATIONS={};
for(const lm of NYC_LANDMARKS){
 const p=arrivalAt(lv95ToWorld(lm.E,lm.N),lm.road);
 TELEPORT_LOCATIONS[lm.id]=Math.hypot(p.x-lm.x,p.z-lm.z)<400?p:arrivalAt(lm);
 const t=TELEPORT_LOCATIONS[lm.id];t.heading=Math.atan2(lm.x-t.x,lm.z-t.z);
}
for(const lm of NYC_LANDMARKS)if(!LANDMARK_SITES[lm.name])LANDMARK_SITES[lm.name]={x:lm.x,z:lm.z,w:60,d:60,h:20,ring:[]};
function getLocationLabel(x,z){
 for(const lm of NYC_LANDMARKS)if(Math.hypot(x-lm.x,z-lm.z)<100)return lm.name;
 const nearby=nearestRoads(x,z,100).filter(q=>q.road.raw);
 if(nearby.length>1&&nearby[1].dist<22)return `${nearby[0].road.name} & ${nearby[1].road.name}`;
 if(nearby.length)return nearby[0].road.name;
 if(waterAt(x,z))return x>LAKE_SW.x&&x<LAKE_NE.x&&z<LAKE_SW.z&&z>LAKE_NE.z?'Davosersee':'Landwasser · Davos';
 const district=districtAt(x,z);
 if(district==='city')return 'Davos';
 const name=BERLIN_AREAS.find(a=>a.id===district)?.name||district.split('_').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');
 // The neighbouring municipalities clipped by the frame (Klosters, Arosa, Zernez) keep their own name
 return name;
}
// Keyboard shortcuts are ignored while typing into a form field (e.g. the map's street search box)
function isTypingInField(e) {
  return e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT');
}

// Traffic signal cycle shared by the signal heads (street-details.js) and the traffic (traffic.js), in seconds:
// avenues green until avenueAmber, amber until avenueRed; cross streets green from avenueRed until streetAmber,
// amber until the end of the cycle. Pedestrians cross with the traffic that runs parallel to them, stepping off
// only on the WALK, the first `walk` seconds of its green: long enough before the cross traffic's green for the
// slowest walker to get across the widest avenue.
const SIGNAL_TIMING = { cycle: 60, avenueAmber: 26, avenueRed: 30, streetAmber: 56, walk: 7 };

// 'green', 'amber' or 'red' for avenue or cross street traffic at a given time
function signalPhase(time, isAvenue) {
  const { cycle, avenueAmber, avenueRed, streetAmber } = SIGNAL_TIMING;
  const t = ((time % cycle) + cycle) % cycle;
  if (isAvenue) return t < avenueAmber ? 'green' : t < avenueRed ? 'amber' : 'red';
  return t < avenueRed ? 'red' : t < streetAmber ? 'green' : 'amber';
}

// Do pedestrians walking alongside avenue (or cross street) traffic have the WALK at a given time?
function walkSignal(time, isAvenue) {
  const { cycle, avenueRed, walk } = SIGNAL_TIMING;
  const t = (((time - (isAvenue ? 0 : avenueRed)) % cycle) + cycle) % cycle;
  return t < walk;
}
export {
  BERLIN_DATA, BERLIN_AREAS, toPts, projectLonLat, pointInPoly, waterAt, waterAtExact, nearestDrivingPoint, defaultSpawn, sidewalkAt, roadCloserThan,
  AVENUES,
  ALL_AVENUES,
  CENTRAL_PARK_BOUNDS,
  getIslandBoundsAtZ,
  MANHATTAN_COASTLINE,
  getBroadwayX,
  BROADWAY_LINE,
  WATERFRONT_PIERS,
  ROOSEVELT_ISLAND_POLYGON,
  GOVERNORS_ISLAND_POLYGON,
  NJ_SHORELINE_POLYGON,
  LONG_ISLAND_POLYGON,
  LONG_ISLAND_POLYGONS,
  BROOKLYN_POLYGONS,
  QUEENS_POLYGONS,
  BRONX_POLYGONS,
  WESTCHESTER_POLYGON,
  NASSAU_POLYGON,
  UPPER_MANHATTAN_POLYGON,
  BRONX_POLYGON,
  STATEN_ISLAND_POLYGON,
  RANDALLS_ISLAND_POLYGON,
  LIBERTY_ISLAND_POLYGON,
  LIBERTY_STATUE_POS,
  ELLIS_ISLAND_POLYGON,
  MILL_ROCK_POLYGON,
  EAST_RIVER_BRIDGES,
  OUTER_BRIDGES,
  STREETS,
  ALL_STREETS,
  ROADS,
  NYC_LANDMARKS,
  LANDMARK_SITES,
  TELEPORT_LOCATIONS,
  ISLAND_BOUNDS,
  LANDMARK_BLOCKS,
  BLOCKS,
  CUT_Z,
  SIGNAL_TIMING,
  streetZ,
  avenueX,
  avenueNameAt,
  districtAt,
  blockAt,
  blocksInRect,
  nearestRoads,
  getBlockBounds,
  getLocationLabel,
  fromOldFrame,
  isTypingInField,
  signalPhase,
  walkSignal
};
