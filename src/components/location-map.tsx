import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

interface LocationMapProps {
  lat: number;
  lon: number;
  onChange: (lat: number, lon: number) => void;
}

function LocationMarker({ lat, lon, onChange }: LocationMapProps) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });

  return Number.isFinite(lat) && Number.isFinite(lon) ? <Marker position={[lat, lon]} /> : null;
}

export function LocationMap({ lat, lon, onChange }: LocationMapProps) {
  return (
    <div className="flex flex-col gap-2 h-full min-h-[400px]" data-testid="location-map-container">
      <div className="flex-1 rounded-md overflow-hidden border">
        <MapContainer center={[14.5995, 120.9842]} zoom={6} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <LocationMarker lat={lat} lon={lon} onChange={onChange} />
        </MapContainer>
      </div>
      <div className="text-sm text-muted-foreground flex justify-between">
        <span>Selected Coordinates:</span>
        <span className="font-mono bg-muted px-2 py-1 rounded">
          {lat.toFixed(4)}, {lon.toFixed(4)}
        </span>
      </div>
    </div>
  );
}
