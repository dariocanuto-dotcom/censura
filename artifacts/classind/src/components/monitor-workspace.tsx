import { createPortal } from 'react-dom';
import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import { GripVertical, Lock, Unlock, RotateCcw } from "lucide-react";

type PanelSize = { span: number; height?: number; column?: number; row?: number };
type Saved = { order: string[]; sizes: Record<string, PanelSize>; locked: boolean; showBts: boolean; hidden:string[] };
const KEY = "dccp-monitor-layout-v1";
const DEFAULT: Saved = { order: [], sizes: {}, locked: true, showBts: false, hidden:[] };
const names: Record<string, string> = { "panel-preview": "Preview", "panel-vu": "Áudio", "panel-loudness": "Loudness", "panel-arib": "Closed Caption", "panel-epg": "EPG", "panel-srt-channel": "Canal SRT", "panel-status": "Estado", "panel-metrics": "Sinal", "panel-bts-quick": "Relatórios BTS", "panel-source-info": "Entrada", "panel-tables": "Tabelas BTS", "RecordingBlocks": "Gravação", "alerts": "Alertas" };
export function MonitorWorkspace({ children }: { children: ReactNode }) {
  const [layout, setLayout] = useState<Saved>(() => { try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return DEFAULT; } });
  const [toolbarHost,setToolbarHost]=useState<HTMLElement|null>(null);
  useEffect(()=>{setToolbarHost(document.getElementById('monitor-window-controls'));},[]);
  const [dragged, setDragged] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [rowSpans, setRowSpans] = useState<Record<string, number>>({});
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(layout)); }, [layout]);
  const panels = Children.toArray(children).flatMap(group => isValidElement<{ children?: ReactNode }>(group) ? Children.toArray(group.props.children) : []);
  const entries = panels.filter(isValidElement).map((node, index) => {
    const element = node as React.ReactElement<{ "data-testid"?: string }>;
    const component = typeof element.type === "function" ? element.type.name : "";
    const id = element.props["data-testid"] ?? (component || `panel-${index}`);
    return { id, node };
  });
  entries.sort((a, b) => { const ai = layout.order.indexOf(a.id), bi = layout.order.indexOf(b.id); return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi); });
  const visibleEntries=entries.filter(e=>!layout.hidden.includes(e.id)&&(e.id!=="panel-tables"||layout.showBts));
  const panelIds = visibleEntries.map(entry => entry.id).join("|");
  // Compact placement recalculates after every size change, preventing overlap
  // and allowing neighbors to close gaps when a panel becomes smaller.
  const positions:Record<string,{column:number;row:number}>={};
  const occupied=new Set<string>();
  for(const entry of visibleEntries){
    const size=layout.sizes[entry.id];const span=Math.max(2,Math.min(12,size?.span??(["panel-preview","panel-tables","alerts"].includes(entry.id)?6:3)));
    const height=rowSpans[entry.id]??1;const preferred=Math.max(1,Math.min(13-span,size?.column??1));
    const columns=[preferred,...Array.from({length:13-span},(_,i)=>i+1).filter(col=>col!==preferred)];
    let placed=false;
    for(let row=1;!placed;row++)for(const column of columns){
      let free=true;for(let y=row;y<row+height&&free;y++)for(let x=column;x<column+span;x++)if(occupied.has(`${x}:${y}`)){free=false;break;}
      if(!free)continue;
      positions[entry.id]={column,row};for(let y=row;y<row+height;y++)for(let x=column;x<column+span;x++)occupied.add(`${x}:${y}`);
      placed=true;break;
    }
  }
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const update = () => {
      const sizes: Record<string, number> = {};
      for (const panel of Array.from(grid.children) as HTMLElement[]) {
        const id = panel.dataset.panelId;
        if (!id) continue;
        const header = panel.firstElementChild as HTMLElement;
        const content = panel.querySelector<HTMLElement>(".monitor-panel-content");
        const height = header.getBoundingClientRect().height + (content?.getBoundingClientRect().height ?? 0) + 2;
        sizes[id] = Math.max(1, Math.ceil((height + 4) / 12));
      }
      setRowSpans(previous => JSON.stringify(previous) === JSON.stringify(sizes) ? previous : sizes);
    };
    const observer = new ResizeObserver(update);
    for (const panel of Array.from(grid.children)) {
      for (const child of Array.from(panel.children)) observer.observe(child);
    }
    update();
    return () => observer.disconnect();
  }, [panelIds, layout.showBts]);
  const move = (target: string, below = false, moving = dragged) => {
    if (!moving || moving === target || layout.locked) return;
    const grid = gridRef.current;
    const panel = grid?.querySelector<HTMLElement>(`[data-panel-id="${target}"]`);
    if (!grid || !panel) return;
    const rect = panel.getBoundingClientRect(), gridRect = grid.getBoundingClientRect();
    const column = Math.max(1, Math.round((rect.left - gridRect.left) / ((gridRect.width + 4) / 12)) + 1);
    const row = Math.max(1, Math.round((rect.top - gridRect.top) / 12) + 1);
    const targetSpan = layout.sizes[target]?.span ?? (["panel-preview", "panel-tables", "alerts"].includes(target) ? 6 : 3);
    const order = entries.map(e => e.id).filter(id => id !== moving);
    order.splice(order.indexOf(target) + (below ? 1 : 0), 0, moving);
    setLayout(l => ({ ...l, order, sizes: { ...l.sizes,
      [target]: { ...l.sizes[target], span: targetSpan, column, row: below ? row : row + (rowSpans[moving] ?? 1) },
      [moving]: { ...l.sizes[moving], span: below ? targetSpan : l.sizes[moving]?.span ?? 3,
        column, row: below ? row + (rowSpans[target] ?? 1) : row },
    } })); setDragged(null);
  };
  const controls=<div className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
      <details className="relative" data-testid="menu-janelas">
        <summary className="cursor-pointer select-none px-3 py-1.5 rounded-md border border-[#2a3050] bg-[#1a1f2e]">Janelas</summary>
        <div className="absolute right-0 top-full mt-1 z-50 min-w-52 max-h-[70vh] overflow-auto rounded-lg border border-[#2a3050] bg-[#0f1117] p-2 shadow-xl">
          {entries.map(entry=><label key={entry.id} className="flex items-center gap-2 rounded px-2 py-2 hover:bg-[#1a1f2e] cursor-pointer"><input type="checkbox" checked={visibleEntries.some(e=>e.id===entry.id)} onChange={event=>setLayout(previous=>({...previous,showBts:entry.id==='panel-tables'?event.target.checked:previous.showBts,hidden:event.target.checked?previous.hidden.filter(id=>id!==entry.id):[...new Set([...previous.hidden,entry.id])]}))}/>{names[entry.id]??'Monitoramento'}</label>)}
          <button className="mt-1 w-full text-left px-2 py-2 text-teal-300 border-t border-[#2a3050]" onClick={()=>setLayout(previous=>({...previous,hidden:[],showBts:true}))}>Mostrar todas</button>
        </div>
      </details>
      <button onClick={() => setLayout(l => ({ ...l, locked: !l.locked }))} className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#2a3050] bg-[#1a1f2e]" aria-label={layout.locked ? "Destravar layout" : "Travar layout"}>{layout.locked ? <Lock size={14}/> : <Unlock size={14}/>}{layout.locked ? "Layout travado" : "Editar layout"}</button>
      {!layout.locked && <button onClick={() => setLayout({ ...DEFAULT, locked: false })} className="flex items-center gap-2"><RotateCcw size={14}/>Restaurar padrão</button>}
      {!layout.locked && <button onClick={() => move("panel-preview", true, "RecordingBlocks")} className="px-3 py-1.5 rounded-md border border-[#2a3050] bg-[#1a1f2e]">Gravação abaixo do Preview</button>}
    </div>;
  return <section className="bg-black text-gray-200">
    {toolbarHost?createPortal(controls,toolbarHost):controls}
    <div ref={gridRef} className="monitor-layout-grid grid grid-cols-1 md:grid-cols-12 gap-1 items-start" data-testid="monitor-workspace">
      {visibleEntries.map(({ id, node }) => {
        const size = layout.sizes[id] ?? { span: ["panel-preview", "panel-tables", "alerts"].includes(id) ? 6 : 3 };
        return <div key={id} data-panel-id={id} className="monitor-layout-panel min-w-0 relative rounded-lg border border-[#1e2332] bg-[#0f1117] overflow-hidden" style={{ "--panel-span": Math.max(2,Math.min(12,size.span)), "--panel-rows": rowSpans[id] ?? 1, "--panel-column": positions[id]?.column ?? "auto", "--panel-row": positions[id]?.row ?? "auto" } as React.CSSProperties}
          onDragOver={e => { if (!layout.locked) e.preventDefault(); }} onDrop={e => { e.preventDefault(); const rect = e.currentTarget.getBoundingClientRect(); move(id, e.clientY > rect.top + rect.height / 2); }}>
          <div className="flex items-center justify-between bg-[#131722] rounded-t-lg px-2 py-1 text-[10px] text-gray-400">
            <span>{names[id] ?? "Monitoramento"}</span>
            {!layout.locked && <span draggable onDragStart={e => { setDragged(id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); }} onDragEnd={() => setDragged(null)} className="cursor-grab p-1" title="Arraste para mover"><GripVertical size={14}/></span>}
          </div>
          <div className={`monitor-panel-content bg-[#0f1117] ${size.height ? "monitor-panel-sized" : ""} ${id === "panel-preview" ? "monitor-preview-content" : ""}`} style={size.height ? { height: size.height, overflow: id === "panel-preview" ? "hidden" : "auto" } : undefined}>{node}</div>
          {!layout.locked && <button aria-label={`Redimensionar ${names[id] ?? id}`} className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize text-teal-400 touch-none" onPointerDown={e => {
            e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
            const parent = e.currentTarget.parentElement!; const gridWidth = parent.parentElement!.clientWidth;
            const startX = e.clientX, startY = e.clientY, initialHeight = parent.clientHeight - 24;
            const moveSize = (event: PointerEvent) => setLayout(l => ({ ...l, sizes: { ...l.sizes, [id]: { ...size, span: Math.max(2, Math.min(12, size.span + Math.round((event.clientX - startX) / (gridWidth / 12)))), height: Math.max(100, initialHeight + event.clientY - startY) } } }));
            const finish = () => { window.removeEventListener("pointermove", moveSize); window.removeEventListener("pointerup", finish); };
            window.addEventListener("pointermove", moveSize); window.addEventListener("pointerup", finish, { once: true });
          }}>◢</button>}
        </div>;
      })}
    </div>
    <style>{`
      .monitor-panel-sized > * { min-height: 100%; box-sizing: border-box; }
      .monitor-preview-content.monitor-panel-sized > [data-testid="panel-preview"] { height: 100%; aspect-ratio: auto !important; }
      .monitor-preview-content video { object-fit: contain; background: #000; }
      .monitor-panel-content { scrollbar-color: #374151 #0f1117; }
      @media(min-width:768px){
        .monitor-layout-grid { grid-auto-rows: 8px; grid-auto-flow: row dense; }
        .monitor-layout-panel { grid-column:var(--panel-column) / span var(--panel-span); grid-row:var(--panel-row) / span var(--panel-rows); }
      }
    `}</style>
  </section>;
}

