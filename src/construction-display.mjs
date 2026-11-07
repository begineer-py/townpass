// Group only visually equivalent records from the same source project. The
// routing checker continues to inspect every individual geometry and impact.
export function groupConstructionNotices(works, limit = 6) {
  const groups = new Map();
  for (const work of works || []) {
    const project = String(work.id || '').replace(/-\d+$/, '');
    const key = JSON.stringify([project && project !== 'work' ? project : work.id, work.address, work.start, work.end,
      work.hours, work.longTerm, work.impact, work.plan]);
    const existing = groups.get(key);
    if (existing) {existing.count++;existing.ids.push(work.id);}
    else groups.set(key, { ...work, count: 1, ids:[work.id] });
  }
  return [...groups.values()].slice(0, limit);
}
