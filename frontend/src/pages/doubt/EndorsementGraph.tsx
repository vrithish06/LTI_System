import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

interface Edge {
  from_student_id: string;
  from_student_name: string;
  to_student_id: string;
  to_student_name: string;
  topic: string;
  bp_exchanged: number;
  created_at: string;
}

interface Props {
  edges: Edge[];
  currentUserId?: string;
  onNodeClick?: (studentId: string, studentName: string) => void;
}

export default function EndorsementGraph({ edges, currentUserId, onNodeClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; lines: string[] } | null>(null);

  useEffect(() => {
    if (!svgRef.current || edges.length === 0) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const W = svgRef.current.clientWidth || 700;
    const H = svgRef.current.clientHeight || 500;

    // ── palette & topic colours ───────────────────────────────────────────────
    const palette = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];
    const topicColors: Record<string, string> = {};
    let ci = 0;
    edges.forEach(e => {
      if (!topicColors[e.topic]) topicColors[e.topic] = palette[ci++ % palette.length];
    });

    // ── nodes ─────────────────────────────────────────────────────────────────
    const nodeMap = new Map<string, { id: string; name: string; cleared: number; asked: number }>();
    edges.forEach(e => {
      [{ id: e.from_student_id, name: e.from_student_name }, { id: e.to_student_id, name: e.to_student_name }].forEach(s => {
        if (!nodeMap.has(s.id)) nodeMap.set(s.id, { id: s.id, name: s.name, cleared: 0, asked: 0 });
      });
      nodeMap.get(e.to_student_id)!.cleared += 1;   // helper
      nodeMap.get(e.from_student_id)!.asked += 1;   // asker
    });

    const nodes = Array.from(nodeMap.values()) as any[];

    // ── group multi-edges between the same pair ───────────────────────────────
    // key = "minId::maxId"  value = list of raw edges
    type LinkGroup = {
      source: string; target: string;
      entries: { topic: string; bp: number; color: string; date: string }[];
    };
    const pairMap = new Map<string, LinkGroup>();
    edges.forEach(e => {
      const key = [e.from_student_id, e.to_student_id].join('::');
      if (!pairMap.has(key)) pairMap.set(key, { source: e.from_student_id, target: e.to_student_id, entries: [] });
      pairMap.get(key)!.entries.push({ topic: e.topic, bp: e.bp_exchanged, color: topicColors[e.topic], date: e.created_at?.slice(0, 10) || '' });
    });
    const linkGroups = Array.from(pairMap.values()) as any[];

    // ── SVG layers ────────────────────────────────────────────────────────────
    const g = svg.append('g');
    svg.call(d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.3, 3]).on('zoom', ev => g.attr('transform', ev.transform)) as any);

    const defs = svg.append('defs');

    // Arrow markers per topic colour
    Object.entries(topicColors).forEach(([topic, color]) => {
      const id = `arrow-${topic.replace(/[^a-zA-Z0-9]/g, '_')}`;
      defs.append('marker')
        .attr('id', id).attr('viewBox', '0 -5 10 10').attr('refX', 22).attr('refY', 0)
        .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
        .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', color);
    });

    // ── simulation ────────────────────────────────────────────────────────────
    // We feed ONE flat link per entry so the spring force acts on each individually
    const simLinks = edges.map(e => ({ source: e.from_student_id, target: e.to_student_id })) as any[];

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(simLinks).id((d: any) => d.id).distance(160))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collide', d3.forceCollide(50));

    // ── draw curved paths per group ───────────────────────────────────────────
    const edgeG = g.append('g').attr('class', 'edges');
    const labelG = g.append('g').attr('class', 'edge-labels');

    // We'll draw one <path> + one <text> per entry in each group
    // Entries in the same group get different curvature offsets
    const allEntries: any[] = [];
    linkGroups.forEach(grp => {
      const n = grp.entries.length;
      grp.entries.forEach((entry: any, i: number) => {
        // Curvature offset: spread entries fan-wise
        const curvature = n === 1 ? 0 : (i - (n - 1) / 2) * 50;
        allEntries.push({ ...entry, source: grp.source, target: grp.target, curvature, total: n });
      });
    });

    // Look up node by id (will be filled after sim nodes are ready)
    const nodeById = new Map<string, any>();
    nodes.forEach(n => nodeById.set(n.id, n));

    const paths = edgeG.selectAll('path').data(allEntries).join('path')
      .attr('fill', 'none')
      .attr('stroke', (d: any) => d.color)
      .attr('stroke-width', 2)
      .attr('opacity', 0.75)
      .attr('marker-end', (d: any) => `url(#arrow-${d.topic.replace(/[^a-zA-Z0-9]/g, '_')})`);

    const edgeLabels = labelG.selectAll('text').data(allEntries).join('text')
      .text((d: any) => d.total === 1 ? d.topic : '')  // show topic only if single edge between pair
      .attr('font-size', 9)
      .attr('fill', (d: any) => d.color)
      .attr('text-anchor', 'middle')
      .attr('pointer-events', 'none');

    // Invisible wider path for hover hit-area + topic badge on hover
    edgeG.selectAll('path.hit').data(allEntries).join('path')
      .attr('class', 'hit')
      .attr('fill', 'none')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 14)
      .on('mouseenter', (ev: any, d: any) => {
        const src = nodeById.get(d.source);
        const tgt = nodeById.get(d.target);
        const srcName = src?.name || d.source;
        const tgtName = tgt?.name || d.target;
        setTooltip({
          x: ev.clientX,
          y: ev.clientY,
          lines: [
            `📚 Topic: ${d.topic}`,
            `💰 BP: ${d.bp}`,
            `↗ ${srcName} → ${tgtName}`,
            `📅 ${d.date}`,
          ],
        });
      })
      .on('mouseleave', () => setTooltip(null));

    // ── nodes ─────────────────────────────────────────────────────────────────
    const nodeEl = g.append('g').selectAll('circle').data(nodes).join('circle')
      .attr('r', (d: any) => 14 + d.cleared * 5)
      .attr('fill', (d: any) => d.id === currentUserId ? '#f59e0b' : '#8b5cf6')
      .attr('stroke', '#fff').attr('stroke-width', 2).attr('cursor', 'pointer')
      .call(d3.drag<SVGCircleElement, any>()
        .on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on('end', (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }) as any)
      .on('click', (_ev: any, d: any) => onNodeClick?.(d.id, d.name))
      .on('mouseenter', (ev: any, d: any) => setTooltip({
        x: ev.clientX, y: ev.clientY,
        lines: [`👤 ${d.name}`, `✅ Helped: ${d.cleared}`, `❓ Asked: ${d.asked}`],
      }))
      .on('mouseleave', () => setTooltip(null));

    const nodeLabel = g.append('g').selectAll('text').data(nodes).join('text')
      .text((d: any) => d.name.split(' ')[0])
      .attr('font-size', 11).attr('font-weight', 'bold')
      .attr('text-anchor', 'middle').attr('pointer-events', 'none')
      .attr('fill', 'var(--text-primary)');

    // ── tick ──────────────────────────────────────────────────────────────────
    function pathD(d: any) {
      const src = nodeById.get(d.source) || { x: 0, y: 0 };
      const tgt = nodeById.get(d.target) || { x: 0, y: 0 };
      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      // perpendicular offset for curvature
      const nx = -dy / len;
      const ny = dx / len;
      const mx = (src.x + tgt.x) / 2 + nx * d.curvature;
      const my = (src.y + tgt.y) / 2 + ny * d.curvature;
      return `M${src.x},${src.y} Q${mx},${my} ${tgt.x},${tgt.y}`;
    }

    sim.on('tick', () => {
      // After first tick, populate nodeById positions
      nodes.forEach(n => nodeById.set(n.id, n));

      paths.attr('d', pathD);
      // Hit areas share same path
      edgeG.selectAll('path.hit').attr('d', pathD);

      edgeLabels.attr('x', (d: any) => {
        const src = nodeById.get(d.source) || { x: 0, y: 0 };
        const tgt = nodeById.get(d.target) || { x: 0, y: 0 };
        const nx = -(tgt.y - src.y) / (Math.sqrt((tgt.x - src.x) ** 2 + (tgt.y - src.y) ** 2) || 1);
        return (src.x + tgt.x) / 2 + nx * d.curvature;
      }).attr('y', (d: any) => {
        const src = nodeById.get(d.source) || { x: 0, y: 0 };
        const tgt = nodeById.get(d.target) || { x: 0, y: 0 };
        const ny = (tgt.x - src.x) / (Math.sqrt((tgt.x - src.x) ** 2 + (tgt.y - src.y) ** 2) || 1);
        return (src.y + tgt.y) / 2 + ny * d.curvature - 5;
      });

      nodeEl.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y);
      nodeLabel.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y - 20 - d.cleared * 3);
    });

    return () => { sim.stop(); };
  }, [edges, currentUserId]);

  // ── Legend ────────────────────────────────────────────────────────────────
  const allTopics = Array.from(new Set(edges.map(e => e.topic)));
  const palette = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];
  const legendColors: Record<string, string> = {};
  allTopics.forEach((t, i) => { legendColors[t] = palette[i % palette.length]; });

  if (edges.length === 0) return (
    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: '2rem' }}>🕸️</div>
      <p style={{ marginTop: '0.5rem' }}>No endorsement connections yet.</p>
    </div>
  );

  return (
    <div style={{ position: 'relative' }}>
      {/* Legend */}
      {allTopics.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
          {allTopics.map(t => (
            <span key={t} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: legendColors[t] + '22', border: `1px solid ${legendColors[t]}`,
              borderRadius: 20, padding: '2px 10px', fontSize: '0.75rem', color: legendColors[t], fontWeight: 600,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: legendColors[t], display: 'inline-block' }} />
              {t}
            </span>
          ))}
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>
            ↗ arrow = asker → helper
          </span>
        </div>
      )}

      <svg ref={svgRef} style={{ width: '100%', height: 500, background: 'var(--bg-secondary)', borderRadius: 12 }} />

      {tooltip && (
        <div style={{
          position: 'fixed', top: tooltip.y + 12, left: tooltip.x + 12,
          background: 'rgba(15,15,25,0.92)', color: '#fff',
          padding: '8px 12px', borderRadius: 10, fontSize: '0.78rem',
          pointerEvents: 'none', whiteSpace: 'pre', zIndex: 9999,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          lineHeight: 1.6,
        }}>
          {tooltip.lines.join('\n')}
        </div>
      )}
    </div>
  );
}
