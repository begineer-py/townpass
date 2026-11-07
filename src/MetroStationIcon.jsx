import { TrainFront } from "lucide-react";
import { metroStationCodes, metroStationIconUrl } from "./metro-station-icons.mjs";

export function MetroStationIcon({ codes, value }) {
  const icons = metroStationCodes(codes, value).filter((code) => metroStationIconUrl(code));
  if (!icons.length) return <TrainFront size={20} aria-hidden="true" />;
  return (
    <span className="metro-station-icons" aria-hidden="true">
      <TrainFront className="metro-station-icon-fallback" size={20} />
      {icons.map((code) => (
        <img key={code} src={metroStationIconUrl(code)} alt="" loading="lazy"
          onError={(event) => { event.currentTarget.hidden = true; }} />
      ))}
    </span>
  );
}
