import { useEffect, useRef } from "react";

export interface StationModelItem {
  id: string;
  label: string;
  type: string;
  status: "normal" | "warning" | "critical" | "offline" | "monitoring";
  health: number;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

interface Props {
  items?: StationModelItem[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  interactive?: boolean;
  animate?: boolean;
  className?: string;
  command?: { type: "reset" | "zoomIn" | "zoomOut" | "focus"; id: number; targetId?: string };
}

type Point3 = { x: number; y: number; z: number };
type Point2 = { x: number; y: number; depth: number };

const DEFAULT_ITEMS: StationModelItem[] = [
  { id: "main", label: "Main Station", type: "Infrastructure", status: "normal", health: 96, x: 0, z: 0, w: 7.2, d: 4.2, h: 2.8 },
  { id: "lab", label: "Science Laboratory", type: "Laboratory", status: "monitoring", health: 92, x: -5.8, z: -2.4, w: 4.0, d: 3.2, h: 2.2 },
  { id: "living", label: "Residential Wing", type: "Living", status: "normal", health: 94, x: 5.4, z: 2.2, w: 4.2, d: 3.0, h: 2.1 },
  { id: "power", label: "Power House", type: "Energy", status: "normal", health: 91, x: -2.8, z: 5.2, w: 4.0, d: 3.2, h: 2.0 },
  { id: "fuel", label: "Fuel Storage", type: "Energy", status: "warning", health: 84, x: 6.5, z: -4.8, w: 3.2, d: 2.8, h: 1.8 },
  { id: "comm", label: "Communications", type: "Comms", status: "normal", health: 98, x: -7.0, z: 3.5, w: 2.7, d: 2.4, h: 1.7 },
  { id: "equip", label: "Science Equipment", type: "Scientific", status: "monitoring", health: 89, x: 1.8, z: -4.4, w: 3.5, d: 2.6, h: 1.7 },
];

const STATUS: Record<string, string> = {
  normal: "#27d9a6",
  monitoring: "#16c7e8",
  warning: "#f5b942",
  critical: "#ff5d67",
  offline: "#73869a",
};

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
function mix(a: number, b: number, t: number) { return a + (b - a) * t; }

export default function ThreeDStationCanvas({ items = DEFAULT_ITEMS, selectedId, onSelect, interactive = true, animate = false, className = "", command }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef({ yaw: -0.72, pitch: 0.68, zoom: 1, panX: 0, panY: 16, targetX: 0, targetZ: 0, dragging: false, panning: false, lastX: 0, lastY: 0, time: 0 });
  const itemsRef = useRef(items);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => {
    if (!command) return;
    if (command.type === "reset") state.current = { ...state.current, yaw: -0.72, pitch: 0.68, zoom: 1, panX: 0, panY: 16, targetX: 0, targetZ: 0 };
    if (command.type === "zoomIn") state.current.zoom = clamp(state.current.zoom * 1.16, .55, 1.9);
    if (command.type === "zoomOut") state.current.zoom = clamp(state.current.zoom / 1.16, .55, 1.9);
    if (command.type === "focus") {
      const target = itemsRef.current.find(item => item.id === command.targetId);
      if (target) { state.current.targetX = target.x; state.current.targetZ = target.z; state.current.zoom = 1.55; state.current.panX = 0; state.current.panY = 16; }
    }
  }, [command?.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let alive = true;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const project = (p: Point3): Point2 => {
      const s = state.current;
      const cy = Math.cos(s.yaw), sy = Math.sin(s.yaw);
      const localX = p.x - s.targetX, localZ = p.z - s.targetZ;
      const x1 = localX * cy - localZ * sy;
      const z1 = localX * sy + localZ * cy;
      const cp = Math.cos(s.pitch), sp = Math.sin(s.pitch);
      const y1 = p.y * cp - z1 * sp;
      const z2 = p.y * sp + z1 * cp;
      const rect = canvas.getBoundingClientRect();
      const focal = Math.min(rect.width, rect.height) * 1.05 * s.zoom;
      const perspective = focal / Math.max(12, 34 - z2);
      return { x: rect.width / 2 + (x1 * perspective) + s.panX, y: rect.height / 2 - (y1 * perspective) + s.panY, depth: z2 };
    };

    const quad = (points: Point2[], fill: string, stroke?: string, width = 1) => {
      ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
    };

    const drawSnow = (w: number, h: number) => {
      const g = ctx.createLinearGradient(0, h * .45, 0, h);
      g.addColorStop(0, "#102b3b"); g.addColorStop(.5, "#0b2030"); g.addColorStop(1, "#071520");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

      const center = project({ x: 0, y: -0.05, z: 0 });
      const edgeA = project({ x: -15, y: -0.05, z: -13 });
      const edgeB = project({ x: 15, y: -0.05, z: -13 });
      const edgeC = project({ x: 15, y: -0.05, z: 15 });
      const edgeD = project({ x: -15, y: -0.05, z: 15 });
      quad([edgeA, edgeB, edgeC, edgeD], "rgba(183,224,233,.035)");

      ctx.save(); ctx.globalAlpha = .18; ctx.lineWidth = 1;
      for (let i = -14; i <= 14; i += 2) {
        const a = project({ x: i, y: 0, z: -14 }); const b = project({ x: i, y: 0, z: 14 });
        ctx.strokeStyle = "#2c8da4"; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      for (let i = -14; i <= 14; i += 2) {
        const a = project({ x: -14, y: 0, z: i }); const b = project({ x: 14, y: 0, z: i });
        ctx.strokeStyle = "#2c8da4"; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.restore();

      // Subtle snow ridges / wind lines.
      ctx.save(); ctx.globalAlpha = .12;
      for (let i = 0; i < 18; i++) {
        const z = -12 + i * 1.5;
        const a = project({ x: -14, y: .02, z }); const b = project({ x: 14, y: .02, z: z + .4 });
        ctx.strokeStyle = "#b8dfe8"; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.restore();
      void center;
    };

    const drawCuboid = (item: StationModelItem) => {
      const y0 = 0, y1 = item.h;
      const x0 = item.x - item.w / 2, x1 = item.x + item.w / 2;
      const z0 = item.z - item.d / 2, z1 = item.z + item.d / 2;
      const p = (x: number, y: number, z: number) => project({ x, y, z });
      const b = [p(x0,y0,z0),p(x1,y0,z0),p(x1,y0,z1),p(x0,y0,z1)];
      const t = [p(x0,y1,z0),p(x1,y1,z0),p(x1,y1,z1),p(x0,y1,z1)];
      const c = STATUS[item.status];
      const selected = selectedRef.current === item.id;
      // Shadow.
      ctx.save(); ctx.globalAlpha = .25; ctx.filter = "blur(7px)";
      quad(b.map(q => ({...q, x: q.x + 3, y: q.y + 6})), "#000"); ctx.restore();

      // Side faces, deliberately separate to create actual perspective depth.
      quad([b[0], b[1], t[1], t[0]], selected ? "#164b5b" : "#123444", c, selected ? 1.6 : .8);
      quad([b[1], b[2], t[2], t[1]], selected ? "#0e3949" : "#0d2939", c, .8);
      quad([b[2], b[3], t[3], t[2]], "#0b2838", c, .6);
      quad([b[3], b[0], t[0], t[3]], "#102f3e", c, .6);
      quad(t, selected ? "#1a5262" : "#163e4d", c, selected ? 1.6 : .9);

      // Roof equipment.
      if (item.id === "main" || item.id === "lab" || item.id === "living") {
        const roofH = .45;
        const rt = [p(x0+.35,y1,z0+.35),p(x1-.35,y1,z0+.35),p(x1-.35,y1+roofH,z1-.35),p(x0+.35,y1+roofH,z1-.35)];
        quad(rt, "#234e5d", "rgba(180,230,238,.35)", .5);
        // roof vents
        for (let i=0;i<3;i++) {
          const cx = mix(x0+.8,x1-1.0,i/2); const v0=p(cx,y1+roofH+.03,z0+.75); const v1=p(cx+.35,y1+roofH+.03,z0+1.05);
          ctx.strokeStyle="rgba(154,218,229,.5)";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(v0.x,v0.y);ctx.lineTo(v1.x,v1.y);ctx.stroke();
        }
      }
      if (item.id === "power") {
        const chimney = project({x:item.x+.65,y:item.h+1.7,z:item.z});
        ctx.strokeStyle="#6f8790";ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(project({x:item.x+.65,y:item.h,z:item.z}).x,project({x:item.x+.65,y:item.h,z:item.z}).y);ctx.lineTo(chimney.x,chimney.y);ctx.stroke();
        ctx.fillStyle="#f5b942";ctx.beginPath();ctx.arc(chimney.x,chimney.y,2.2,0,Math.PI*2);ctx.fill();
      }
      if (item.id === "comm") {
        const base=project({x:item.x,y:item.h,z:item.z}); const top=project({x:item.x,y:item.h+5.4,z:item.z});
        ctx.strokeStyle="#89a8b4";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(base.x,base.y);ctx.lineTo(top.x,top.y);ctx.stroke();
        ctx.strokeStyle="#16c7e8";ctx.lineWidth=1;for(let i=0;i<4;i++){const yy=mix(base.y,top.y,.25+i*.17);ctx.beginPath();ctx.arc(base.x,yy,6+i*2,.15,Math.PI-.15);ctx.stroke();}
      }
      if (item.id === "fuel") {
        for (let i=0;i<2;i++) {
          const cx=item.x-0.75+i*1.5; const base=project({x:cx,y:0,z:item.z}); const top=project({x:cx,y:item.h+.65,z:item.z});
          ctx.fillStyle="#193d4a";ctx.strokeStyle="#f5b942";ctx.lineWidth=.8;ctx.beginPath();ctx.ellipse(base.x,base.y,11,5,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(base.x-11,base.y);ctx.lineTo(top.x-11,top.y);ctx.lineTo(top.x+11,top.y);ctx.lineTo(base.x+11,base.y);ctx.stroke();
        }
      }
      if (item.id === "equip") {
        const base=project({x:item.x,y:item.h,z:item.z}); const panel=project({x:item.x,y:item.h+1.2,z:item.z+.25});
        ctx.strokeStyle="#16c7e8";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(base.x,base.y);ctx.lineTo(panel.x,panel.y);ctx.stroke();
        ctx.fillStyle="#173b4b";ctx.strokeStyle="#5ec8dc";ctx.beginPath();ctx.rect(panel.x-16,panel.y-8,32,16);ctx.fill();ctx.stroke();
      }

      // Windows / operational lights.
      for (let i=0;i<Math.max(2,Math.floor(item.w/1.7));i++) {
        const wx=mix(x0+.7,x1-.7,(i+1)/(Math.max(2,Math.floor(item.w/1.7))+1));
        const q=project({x:wx,y:item.h*.45,z:z0-.015});
        ctx.fillStyle=selected?"rgba(79,223,244,.9)":"rgba(74,164,184,.5)";ctx.fillRect(q.x-2,q.y-1.4,4,2.8);
      }

      // Label plate projected above building.
      const lp=project({x:item.x,y:item.h+1.15,z:item.z});
      ctx.font="600 10px Rajdhani, sans-serif"; ctx.textAlign="center";
      const textW=ctx.measureText(item.label).width+14;
      ctx.fillStyle="rgba(5,17,28,.9)";ctx.strokeStyle=c;ctx.lineWidth=selected?1.2:.6;
      ctx.beginPath();ctx.roundRect(lp.x-textW/2,lp.y-8,textW,16,3);ctx.fill();ctx.stroke();
      ctx.fillStyle="#d9f4f8";ctx.fillText(item.label,lp.x,lp.y+3);
      ctx.font="600 7px JetBrains Mono, monospace";ctx.fillStyle=c;ctx.fillText(item.status.toUpperCase(),lp.x,lp.y+14);

      const allPoints = [...b, ...t];
      const minX = Math.min(...allPoints.map(p => p.x));
      const maxX = Math.max(...allPoints.map(p => p.x));
      const minY = Math.min(...allPoints.map(p => p.y));
      const maxY = Math.max(...allPoints.map(p => p.y));
      const labelMinX = lp.x - textW / 2 - 5;
      const labelMaxX = lp.x + textW / 2 + 5;
      const labelMinY = lp.y - 13;
      const labelMaxY = lp.y + 16;
      
      const fullMinX = Math.min(minX, labelMinX);
      const fullMaxX = Math.max(maxX, labelMaxX);
      const fullMinY = Math.min(minY, labelMinY);
      const fullMaxY = Math.max(maxY, labelMaxY);

      return { item, bounds: { x: fullMinX, y: fullMinY, w: fullMaxX - fullMinX, h: fullMaxY - fullMinY, depth: (b[0].depth+b[2].depth)/2 } };
    };

    const drawAmbient = (w: number, h: number, time: number) => {
      // Aurora / atmosphere.
      const aur = ctx.createRadialGradient(w*.62,h*.16,5,w*.62,h*.16,w*.48);
      aur.addColorStop(0,"rgba(34,218,190,.14)");aur.addColorStop(.35,"rgba(29,180,210,.07)");aur.addColorStop(1,"rgba(0,0,0,0)");ctx.fillStyle=aur;ctx.fillRect(0,0,w,h);
      ctx.save();ctx.globalAlpha=.32;ctx.lineWidth=2;
      for(let i=0;i<4;i++){ctx.beginPath();for(let x=-30;x<w+30;x+=14){const y=h*.14+i*18+Math.sin(x*.012+time*.00025+i)*12; if(x===-30)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.strokeStyle=i%2?"rgba(55,226,198,.16)":"rgba(52,189,236,.12)";ctx.stroke();}ctx.restore();
      // Stars / particles.
      ctx.save();ctx.globalAlpha=.45;for(let i=0;i<80;i++){const x=(i*97)%Math.max(1,w);const y=(i*47)%Math.max(1,h*.55);const r=(i%3)*.45+.35;ctx.fillStyle=i%5===0?"#a6eff6":"#d8eef1";ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}ctx.restore();
    };

    const render = (now: number) => {
      if (!alive) return;
      const rect = canvas.getBoundingClientRect(); const w=rect.width,h=rect.height;
      state.current.time=now;
      if (animate) state.current.yaw = -0.72 + Math.sin(now*.00012)*.05;
      ctx.clearRect(0,0,w,h);
      drawAmbient(w,h,now);
      drawSnow(w,h);

      const ordered = [...itemsRef.current].sort((a,b)=>{
        const pa=project({x:a.x,y:a.h/2,z:a.z}); const pb=project({x:b.x,y:b.h/2,z:b.z}); return pa.depth-pb.depth;
      });
      const hit=[] as {item:StationModelItem;bounds:{x:number;y:number;w:number;h:number;depth:number}}[];
      for(const item of ordered) hit.push(drawCuboid(item));

      // Perimeter lights.
      ctx.save();ctx.globalAlpha=.5;ctx.strokeStyle="#16c7e8";ctx.lineWidth=1;ctx.setLineDash([4,6]);
      const pa=project({x:-12,y:.02,z:-10}),pb=project({x:12,y:.02,z:-10}),pc=project({x:12,y:.02,z:10}),pd=project({x:-12,y:.02,z:10});
      ctx.beginPath();ctx.moveTo(pa.x,pa.y);ctx.lineTo(pb.x,pb.y);ctx.lineTo(pc.x,pc.y);ctx.lineTo(pd.x,pd.y);ctx.closePath();ctx.stroke();ctx.restore();
      (canvas as HTMLCanvasElement & {_hit?: typeof hit})._hit=hit;
      raf=requestAnimationFrame(render);
    };
    raf=requestAnimationFrame(render);

    const down=(e:PointerEvent)=>{
      if(!interactive)return;
      state.current.dragging=true;state.current.panning=e.button===2||e.shiftKey;state.current.lastX=e.clientX;state.current.lastY=e.clientY;canvas.setPointerCapture(e.pointerId);
    };
    const move=(e:PointerEvent)=>{
      const rect=canvas.getBoundingClientRect();const cx=e.clientX-rect.left,cy=e.clientY-rect.top;
      const hitList=(canvas as HTMLCanvasElement & {_hit?: {item:StationModelItem;bounds:{x:number;y:number;w:number;h:number;depth:number}}[]})._hit||[];
      let isHover = false;
      for(const h of hitList){if(cx>=h.bounds.x&&cx<=h.bounds.x+h.bounds.w&&cy>=h.bounds.y&&cy<=h.bounds.y+h.bounds.h){isHover=true;break;}}
      canvas.style.cursor = isHover && interactive ? 'pointer' : 'default';

      if(!interactive||!state.current.dragging)return;
      const dx=e.clientX-state.current.lastX,dy=e.clientY-state.current.lastY;state.current.lastX=e.clientX;state.current.lastY=e.clientY;
      if(state.current.panning){state.current.panX+=dx;state.current.panY+=dy;}else{state.current.yaw+=dx*.008;state.current.pitch=clamp(state.current.pitch-dy*.006,.35,1.08);}
    };
    const up=()=>{state.current.dragging=false;};
    const wheel=(e:WheelEvent)=>{if(!interactive)return;e.preventDefault();state.current.zoom=clamp(state.current.zoom*(1-e.deltaY*.0008),.55,1.9);};
    const click=(e:MouseEvent)=>{
      if(!interactive||!onSelectRef.current)return;
      const rect=canvas.getBoundingClientRect();const x=e.clientX-rect.left,y=e.clientY-rect.top;const hit=(canvas as HTMLCanvasElement & {_hit?: {item:StationModelItem;bounds:{x:number;y:number;w:number;h:number;depth:number}}[]})._hit||[];
      let best:null|StationModelItem=null;let bestDepth=-Infinity;
      for(const h of hit){if(x>=h.bounds.x&&x<=h.bounds.x+h.bounds.w&&y>=h.bounds.y&&y<=h.bounds.y+h.bounds.h&&h.bounds.depth>bestDepth){best=h.item;bestDepth=h.bounds.depth;}}
      if(best)onSelectRef.current(best.id);
    };
    const context=(e:MouseEvent)=>e.preventDefault();
    canvas.addEventListener("pointerdown",down);canvas.addEventListener("pointermove",move);canvas.addEventListener("pointerup",up);canvas.addEventListener("pointercancel",up);canvas.addEventListener("wheel",wheel,{passive:false});canvas.addEventListener("click",click);canvas.addEventListener("contextmenu",context);
    return()=>{alive=false;cancelAnimationFrame(raf);ro.disconnect();canvas.removeEventListener("pointerdown",down);canvas.removeEventListener("pointermove",move);canvas.removeEventListener("pointerup",up);canvas.removeEventListener("pointercancel",up);canvas.removeEventListener("wheel",wheel);canvas.removeEventListener("click",click);canvas.removeEventListener("contextmenu",context);};
  }, [interactive, animate]);

  return <canvas ref={canvasRef} className={className} aria-label="Interactive 3D Antarctic research station digital twin" />;
}

