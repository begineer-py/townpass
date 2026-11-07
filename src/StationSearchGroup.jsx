import { ChevronRight } from "lucide-react";
import { MetroStationIcon } from "./MetroStationIcon.jsx";

export const stationLabel = (name) => (/站$/.test(name) ? name : `${name}站`);

export function StationSearchGroup({ match, renderExit, onDetails }) {
  const { record, name, codes, exits } = match;
  return (
    <section className="station-group" aria-label={`${stationLabel(name)}的無障礙出口`}>
      <div className="station-group-head">
        <span className="station-icon"><MetroStationIcon codes={codes} /></span>
        <span><strong>{stationLabel(name)}</strong>
          <small>{record["路線別"]} · {exits.length ? `${exits.length} 處電梯／坡道出口` : "沒有出口座標"}</small>
        </span>
      </div>
      {exits.map(renderExit)}
      <p className="quiet-note">只標示出入口位置；大廳到月台的電梯請看車站資訊。</p>
      <button className="text-button station-more" onClick={onDetails}>
        車站資訊與保養時段 <ChevronRight size={16} aria-hidden="true" />
      </button>
    </section>
  );
}
