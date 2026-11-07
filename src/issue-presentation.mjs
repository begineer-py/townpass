import { SIDEWALK_ISSUE_KINDS } from './official-sidewalks.mjs';

// Screen cells only reduce clutter; retain every source point for the label.
export function groupVisibleIssues(issues, project, cell) {
  const groups = new Map();
  for (const point of [...issues].sort((a,b) => a.kind-b.kind)) {
    const p = project(point), key = `${Math.floor(p.x/cell)}:${Math.floor(p.y/cell)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(point);
  }
  return [...groups.values()];
}

export function hitIssueGroup(groups, point, radius) {
  let result = null, closest = radius * radius;
  for (const group of groups) {
    const dx = point.x - group.x, dy = point.y - group.y, d = dx * dx + dy * dy;
    if (d <= closest) { closest = d; result = group; }
  }
  return result;
}

export function issueGroupLabel(points) {
  const counts = new Map();
  for (const point of points) {
    const label = SIDEWALK_ISSUE_KINDS[point.kind];
    if (label) counts.set(label, (counts.get(label) || 0) + 1);
  }
  const detail = [...counts].map(([label,count]) => `${label}${count > 1 ? ` ${count}筆` : ''}`).join('；');
  return points.length > 1 ? `此區域 ${points.length} 筆紀錄：${detail}。標記位於其中一筆位置。` : detail;
}

export function routeIssueLabel(point) {
  const activity = /^活動區域分類-(高|中|低)$/.exec(String(point?.activity || ''))?.[1];
  const label = String(point?.label || '官方不利通行紀錄');
  return `${label}（活動區域分類：${activity || '未提供'}）；與路線的實際關係未確認`;
}
