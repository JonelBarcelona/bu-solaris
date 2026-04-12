import { useState, useEffect } from "react";
import { LocationMap } from "@/components/location-map";
import { useGetSolarIrradiance, useCalculateSolar } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Zap, MapPin, Calculator, Satellite, Sun, Users } from "lucide-react";
import { Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Line, ComposedChart } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const MAX_GAUGE_YEARS = 20;

function LoadingScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 7000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0d0517 0%, #1a0a2e 40%, #2d0a0a 100%)" }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(60)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              width: Math.random() * 2 + 1 + "px",
              height: Math.random() * 2 + 1 + "px",
              top: Math.random() * 100 + "%",
              left: Math.random() * 100 + "%",
              opacity: Math.random() * 0.7 + 0.1,
            }}
          />
        ))}
      </div>

      <div className="relative flex items-center justify-center mb-10">
        <svg width="160" height="160" viewBox="0 0 160 160" className="solar-orbit-1">
          <circle cx="80" cy="80" r="68" fill="none" stroke="rgba(249,115,22,0.15)" strokeWidth="1.5" strokeDasharray="4 6" />
          <circle cx="80" cy="12" r="6" fill="#f97316" />
        </svg>
        <svg width="120" height="120" viewBox="0 0 120 120" className="absolute solar-orbit-2">
          <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(192,38,211,0.2)" strokeWidth="1.5" strokeDasharray="3 5" />
          <circle cx="60" cy="10" r="5" fill="#c026d3" />
        </svg>
        <div className="absolute solar-core flex items-center justify-center">
          <div
            className="rounded-full flex items-center justify-center"
            style={{
              width: 72,
              height: 72,
              background: "radial-gradient(circle, #fbbf24 0%, #f97316 50%, #c026d3 100%)",
              boxShadow: "0 0 40px rgba(249,115,22,0.6), 0 0 80px rgba(192,38,211,0.3)",
            }}
          >
            <Sun className="text-white" size={32} />
          </div>
        </div>
      </div>

      <div className="text-center px-8 max-w-lg">
        <h1
          className="text-5xl font-bold mb-3 fade-in-up"
          style={{
            background: "linear-gradient(135deg, #f97316, #e879f9)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            letterSpacing: "0.12em",
          }}
        >
          BU SOLARIS
        </h1>

        <p className="text-white/70 text-lg mb-1 fade-in-up fade-in-up-delay-1 font-medium tracking-wide">
          Solar PV System Sizing &amp; Yield Estimation
        </p>

        <p className="text-white/40 text-sm mb-8 fade-in-up fade-in-up-delay-2 tracking-wider uppercase">
          Bicol University · IEC 61724 Standard
        </p>

        <div className="flex items-center justify-center gap-2 mb-8 fade-in-up fade-in-up-delay-3">
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold"
            style={{
              background: "rgba(249,115,22,0.15)",
              border: "1px solid rgba(249,115,22,0.4)",
              color: "#fdba74",
            }}
          >
            <Satellite size={14} />
            Powered by NASA POWER Satellite Data
          </div>
        </div>

        <div className="w-full max-w-xs mx-auto fade-in-up fade-in-up-delay-4">
          <div className="flex justify-between text-xs text-white/40 mb-2 uppercase tracking-widest">
            <span>Initializing</span>
            <span>Systems</span>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div
              className="h-full rounded-full loading-progress-bar"
              style={{ background: "linear-gradient(90deg, #f97316, #c026d3)" }}
            />
          </div>
        </div>

        <p className="text-white/25 text-xs mt-10 fade-in-up fade-in-up-delay-4 tracking-widest uppercase">
          Barcelona · Luz · Ibañez
        </p>
      </div>
    </div>
  );
}

function PaybackGauge({ years, classification }: { years: number; classification: string }) {
  const cx = 120;
  const cy = 100;
  const r = 80;

  function polarToXY(angleDeg: number) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function arcPath(startAngle: number, endAngle: number) {
    const start = polarToXY(startAngle);
    const end = polarToXY(endAngle);
    const large = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
  }

  const startAngle = 180;
  const totalDeg = 180;
  const clampedYears = Math.min(years, MAX_GAUGE_YEARS);
  const fraction = clampedYears / MAX_GAUGE_YEARS;
  const needleAngle = startAngle + fraction * totalDeg;

  const zones = [
    { from: 0, to: 5, color: "#10b981" },
    { from: 5, to: 10, color: "#3b82f6" },
    { from: 10, to: 15, color: "#f59e0b" },
    { from: 15, to: 20, color: "#ef4444" },
  ];

  const classificationColor =
    classification === "Excellent" ? "#10b981" :
    classification === "Good" ? "#3b82f6" :
    classification === "Moderate" ? "#f59e0b" : "#ef4444";

  const needleTip = polarToXY(needleAngle);

  return (
    <div className="flex flex-col items-center" data-testid="payback-gauge">
      <svg width="240" height="130" viewBox="0 0 240 130" role="img" aria-label={`Payback gauge: ${years.toFixed(1)} years`}>
        {zones.map((zone) => {
          const zoneStart = startAngle + (zone.from / MAX_GAUGE_YEARS) * totalDeg;
          const zoneEnd = startAngle + (zone.to / MAX_GAUGE_YEARS) * totalDeg;
          return (
            <path
              key={zone.from}
              d={arcPath(zoneStart, zoneEnd)}
              stroke={zone.color}
              strokeWidth={16}
              fill="none"
              strokeLinecap="butt"
              opacity={0.22}
            />
          );
        })}
        <path
          d={arcPath(startAngle, needleAngle)}
          stroke={classificationColor}
          strokeWidth={16}
          fill="none"
          strokeLinecap="round"
        />
        <line
          x1={cx}
          y1={cy}
          x2={needleTip.x}
          y2={needleTip.y}
          stroke="white"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={5} fill="white" />
        <text x={cx} y={cy + 22} textAnchor="middle" fontSize="18" fontWeight="700" fill={classificationColor}>
          {years.toFixed(1)} yr
        </text>
      </svg>
      <div className="flex gap-3 text-xs mt-1">
        {[["< 5yr", "#10b981"], ["5–10yr", "#3b82f6"], ["10–15yr", "#f59e0b"], ["> 15yr", "#ef4444"]].map(([label, color]) => (
          <span key={label} className="flex items-center gap-1 text-white/60">
            <span style={{ background: color, width: 8, height: 8, borderRadius: 2, display: "inline-block" }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

const DEFAULT_PARAMS = {
  n_panels: 20,
  panel_wattage: 400,
  panel_efficiency: 20,
  inverter_efficiency: 96,
  system_losses: 14,
  tariff: 9.50,
  installation_cost: 280000,
};

const CARD_STYLE = {
  background: "rgba(20, 12, 40, 0.75)",
  backdropFilter: "blur(16px)",
  border: "1px solid rgba(255,255,255,0.07)",
};

const INPUT_STYLE = "bg-black/30 border-white/10 text-white placeholder:text-white/30 focus:border-orange-500/60 focus:ring-orange-500/30";
const LABEL_STYLE = "text-xs font-semibold uppercase tracking-wider text-white/50";

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [lat, setLat] = useState(14.5995);
  const [lon, setLon] = useState(120.9842);
  const [params, setParams] = useState(DEFAULT_PARAMS);

  const { data: irradianceData, isLoading: isLoadingIrradiance } = useGetSolarIrradiance(
    { lat, lon },
    { query: { enabled: Number.isFinite(lat) && Number.isFinite(lon), queryKey: ["/api/solar/irradiance", { lat, lon }] } }
  );

  const calculateSolar = useCalculateSolar();

  const handleAnalyze = () => {
    if (!irradianceData) return;
    calculateSolar.mutate({
      data: {
        lat,
        lon,
        monthly_ghi: irradianceData.monthly_ghi,
        n_panels: params.n_panels,
        panel_wattage: params.panel_wattage,
        panel_efficiency: params.panel_efficiency / 100,
        inverter_efficiency: params.inverter_efficiency / 100,
        system_losses: params.system_losses / 100,
        tariff: params.tariff,
        installation_cost: params.installation_cost,
      },
    });
  };

  const result = calculateSolar.data;

  return (
    <>
      {loading && <LoadingScreen onDone={() => setLoading(false)} />}

      <div
        className="min-h-[100dvh] flex flex-col"
        style={{ background: "linear-gradient(160deg, #0d0517 0%, #180a2e 45%, #1e0a0a 100%)" }}
      >
        <header className="relative z-10 border-b" style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(10,5,20,0.8)", backdropFilter: "blur(20px)" }}>
          <div
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{ background: "linear-gradient(90deg, rgba(249,115,22,0.15) 0%, transparent 40%, rgba(192,38,211,0.15) 100%)" }}
          />
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between relative">
            <div className="flex items-center gap-4">
              <div
                className="flex items-center justify-center rounded-xl"
                style={{
                  width: 44,
                  height: 44,
                  background: "linear-gradient(135deg, #f97316, #c026d3)",
                  boxShadow: "0 0 16px rgba(249,115,22,0.4)",
                }}
              >
                <Zap size={22} className="text-white" fill="white" />
              </div>
              <div>
                <h1
                  className="text-2xl font-bold tracking-widest"
                  style={{
                    background: "linear-gradient(135deg, #f97316, #e879f9)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  BU SOLARIS
                </h1>
                <p className="text-white/45 text-xs tracking-wider uppercase mt-0.5">
                  Solar PV System Sizing &amp; Yield Estimation · IEC 61724
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{
                  background: "rgba(249,115,22,0.12)",
                  border: "1px solid rgba(249,115,22,0.35)",
                  color: "#fdba74",
                }}
              >
                <Satellite size={12} />
                NASA POWER Data
              </div>
              <div
                className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
                style={{
                  background: "rgba(192,38,211,0.12)",
                  border: "1px solid rgba(192,38,211,0.3)",
                  color: "#e879f9",
                }}
              >
                <Users size={12} />
                Barcelona · Luz · Ibañez
              </div>
            </div>
          </div>
        </header>

        <div
          className="py-2 px-6 text-center text-xs flex items-center justify-center gap-2"
          style={{
            background: "linear-gradient(90deg, rgba(249,115,22,0.08), rgba(192,38,211,0.08))",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.4)",
          }}
        >
          <Satellite size={11} className="text-orange-400/70" />
          Irradiance data sourced in real-time from NASA POWER Climatology API — satellite-derived global horizontal irradiance (GHI) measurements
        </div>

        <main className="flex-1 p-6">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 flex flex-col gap-4">
              <Card style={CARD_STYLE} className="flex-1 min-h-[400px] flex flex-col">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2 text-white">
                    <MapPin className="h-4 w-4 text-orange-400" />
                    Site Location
                  </CardTitle>
                  <CardDescription className="text-white/40 text-xs">Click the map to select installation coordinates</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <LocationMap lat={lat} lon={lon} onChange={(newLat, newLon) => { setLat(newLat); setLon(newLon); }} />
                  <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/40 text-xs uppercase tracking-wider">NASA GHI Data</span>
                      {isLoadingIrradiance ? (
                        <span className="flex items-center gap-1.5 text-xs text-orange-400/80 animate-pulse">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-400 animate-ping" />
                          Fetching...
                        </span>
                      ) : irradianceData ? (
                        <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Data Ready
                        </span>
                      ) : (
                        <span className="text-xs text-white/30">Select Location</span>
                      )}
                    </div>
                    <div className="mt-2 text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
                      Lat: {lat.toFixed(4)}° &nbsp;|&nbsp; Lon: {lon.toFixed(4)}°
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-3">
              <Card style={CARD_STYLE}>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2 text-white">
                    <Calculator className="h-4 w-4 text-purple-400" />
                    System Parameters
                  </CardTitle>
                  <CardDescription className="text-white/40 text-xs">Configure technical specifications</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="n_panels" className={LABEL_STYLE}>Number of Panels</Label>
                    <Input id="n_panels" type="number" className={INPUT_STYLE} value={params.n_panels} onChange={(e) => setParams({...params, n_panels: Number(e.target.value)})} data-testid="input-panels" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="panel_wattage" className={LABEL_STYLE}>Panel Wattage (Wp)</Label>
                    <Input id="panel_wattage" type="number" className={INPUT_STYLE} value={params.panel_wattage} onChange={(e) => setParams({...params, panel_wattage: Number(e.target.value)})} data-testid="input-wattage" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="panel_efficiency" className={LABEL_STYLE}>Panel Eff. (%)</Label>
                      <Input id="panel_efficiency" type="number" className={INPUT_STYLE} value={params.panel_efficiency} onChange={(e) => setParams({...params, panel_efficiency: Number(e.target.value)})} data-testid="input-paneleff" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="inverter_efficiency" className={LABEL_STYLE}>Inv. Eff. (%)</Label>
                      <Input id="inverter_efficiency" type="number" className={INPUT_STYLE} value={params.inverter_efficiency} onChange={(e) => setParams({...params, inverter_efficiency: Number(e.target.value)})} data-testid="input-inveff" />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="system_losses" className={LABEL_STYLE}>System Losses (%)</Label>
                    <Input id="system_losses" type="number" className={INPUT_STYLE} value={params.system_losses} onChange={(e) => setParams({...params, system_losses: Number(e.target.value)})} data-testid="input-losses" />
                  </div>
                  <div className="grid gap-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                    <Label htmlFor="tariff" className={LABEL_STYLE}>Electricity Tariff (₱/kWh)</Label>
                    <Input id="tariff" type="number" step="0.01" className={INPUT_STYLE} value={params.tariff} onChange={(e) => setParams({...params, tariff: Number(e.target.value)})} data-testid="input-tariff" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="installation_cost" className={LABEL_STYLE}>Installation Cost (₱)</Label>
                    <Input id="installation_cost" type="number" className={INPUT_STYLE} value={params.installation_cost} onChange={(e) => setParams({...params, installation_cost: Number(e.target.value)})} data-testid="input-cost" />
                  </div>

                  <Button
                    className="w-full mt-4 font-bold text-sm h-12 border-0 text-white tracking-wider"
                    style={{
                      background: "linear-gradient(135deg, #f97316, #c026d3)",
                      boxShadow: "0 0 20px rgba(249,115,22,0.3)",
                      opacity: (!irradianceData || calculateSolar.isPending) ? 0.5 : 1,
                    }}
                    onClick={handleAnalyze}
                    disabled={!irradianceData || calculateSolar.isPending}
                    data-testid="button-analyze"
                  >
                    {calculateSolar.isPending ? "Calculating..." : "Run Analysis"}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-5">
              {calculateSolar.isPending ? (
                <Card style={CARD_STYLE} className="h-full flex flex-col justify-center items-center p-12 text-center min-h-[500px]">
                  <div
                    className="rounded-full flex items-center justify-center mb-6"
                    style={{ width: 64, height: 64, background: "rgba(249,115,22,0.1)", border: "2px solid rgba(249,115,22,0.3)" }}
                  >
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2" style={{ borderColor: "#f97316" }} />
                  </div>
                  <p className="text-white/50 text-sm tracking-wider">Computing IEC 61724 yield estimations...</p>
                </Card>
              ) : result ? (
                <Card style={CARD_STYLE} className="h-full overflow-hidden flex flex-col">
                  <CardHeader
                    className="pb-4"
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.07)",
                      background: "linear-gradient(90deg, rgba(249,115,22,0.08), rgba(192,38,211,0.08))",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base text-white">Analysis Results</CardTitle>
                      {result.payback_classification === "Excellent" && (
                        <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: "rgba(16,185,129,0.2)", color: "#34d399", border: "1px solid rgba(16,185,129,0.3)" }}>Excellent Payback</span>
                      )}
                      {result.payback_classification === "Good" && (
                        <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: "rgba(59,130,246,0.2)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.3)" }}>Good Payback</span>
                      )}
                      {result.payback_classification === "Moderate" && (
                        <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: "rgba(245,158,11,0.2)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.3)" }}>Moderate Payback</span>
                      )}
                      {result.payback_classification === "Poor" && (
                        <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: "rgba(239,68,68,0.2)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}>Poor Payback</span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 flex-1 overflow-y-auto">
                    <div className="grid grid-cols-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      {[
                        { label: "Annual AC Yield", value: result.annual_ac_kwh.toLocaleString(undefined, {maximumFractionDigits: 0}), unit: "kWh", testId: "result-yield", accent: "#f97316" },
                        { label: "System Capacity", value: result.system_capacity_kwp.toFixed(2), unit: "kWp", testId: "result-capacity", accent: "#c026d3" },
                        { label: "Panel Area", value: result.panel_area.toFixed(1), unit: "m²", testId: "result-area", accent: "#f97316" },
                        { label: "Inverter Size", value: result.inverter_capacity_kva.toFixed(1), unit: "kVA", testId: "result-inverter", accent: "#c026d3" },
                        { label: "Payback Period", value: result.payback_years.toFixed(1), unit: "years", testId: "result-payback", accent: "#f97316" },
                        { label: "CO₂ Offset", value: result.co2_offset_kg.toLocaleString(undefined, {maximumFractionDigits: 0}), unit: "kg/yr", testId: "result-co2", accent: "#10b981" },
                      ].map((item, i) => (
                        <div
                          key={item.label}
                          className="p-4"
                          style={{
                            borderRight: i % 2 === 0 ? "1px solid rgba(255,255,255,0.07)" : "none",
                            borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.07)" : "none",
                          }}
                        >
                          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>{item.label}</p>
                          <p className="text-xl font-bold" style={{ color: item.accent }} data-testid={item.testId}>
                            {item.value} <span className="text-xs font-normal" style={{ color: "rgba(255,255,255,0.35)" }}>{item.unit}</span>
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="p-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-3 text-center" style={{ color: "rgba(255,255,255,0.35)" }}>Payback Period Gauge</p>
                      <PaybackGauge years={result.payback_years} classification={result.payback_classification} />
                    </div>

                    <div className="p-5">
                      <h3 className="text-xs font-semibold mb-4 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>Monthly Energy &amp; Irradiance</h3>
                      <div className="h-[220px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={result.monthly_results} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="month" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.4)" }} />
                            <YAxis yAxisId="left" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.4)" }} />
                            <YAxis yAxisId="right" orientation="right" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.4)" }} />
                            <RechartsTooltip
                              contentStyle={{ backgroundColor: "rgba(10,5,20,0.95)", borderColor: "rgba(255,255,255,0.1)", borderRadius: "8px", color: "white", fontSize: "12px" }}
                              itemStyle={{ color: "rgba(255,255,255,0.8)" }}
                            />
                            <Legend wrapperStyle={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }} />
                            <Bar yAxisId="left" dataKey="ac_kwh" name="AC Energy (kWh)" fill="url(#barGradient)" radius={[4, 4, 0, 0]} />
                            <Line yAxisId="right" type="monotone" dataKey="ghi" name="GHI (kWh/m²/day)" stroke="#e879f9" strokeWidth={2} dot={{ r: 3, fill: "#e879f9" }} />
                            <defs>
                              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#f97316" stopOpacity={0.9} />
                                <stop offset="100%" stopColor="#f97316" stopOpacity={0.4} />
                              </linearGradient>
                            </defs>
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                      <Table>
                        <TableHeader>
                          <TableRow style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(249,115,22,0.06)" }}>
                            <TableHead className="w-[80px] text-xs uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>Month</TableHead>
                            <TableHead className="text-right text-xs uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>GHI</TableHead>
                            <TableHead className="text-right text-xs uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>DC (kWh)</TableHead>
                            <TableHead className="text-right text-xs uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>AC (kWh)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.monthly_results.map((m) => (
                            <TableRow key={m.month} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                              <TableCell className="font-medium text-sm text-white/70">{m.month}</TableCell>
                              <TableCell className="text-right text-sm text-white/50">{m.ghi.toFixed(2)}</TableCell>
                              <TableCell className="text-right text-sm text-white/50">{m.dc_kwh.toFixed(0)}</TableCell>
                              <TableCell className="text-right text-sm font-semibold" style={{ color: "#f97316" }}>{m.ac_kwh.toFixed(0)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow style={{ background: "rgba(249,115,22,0.06)" }}>
                            <TableCell className="font-bold text-sm text-white/80">Total</TableCell>
                            <TableCell className="text-right text-sm text-white/40">—</TableCell>
                            <TableCell className="text-right text-sm font-semibold text-white/60">{result.annual_dc_kwh.toFixed(0)}</TableCell>
                            <TableCell className="text-right text-sm font-bold" style={{ color: "#f97316" }}>{result.annual_ac_kwh.toFixed(0)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card style={{...CARD_STYLE, border: "1px dashed rgba(255,255,255,0.08)"}} className="h-full flex flex-col justify-center items-center p-12 text-center min-h-[500px]">
                  <div
                    className="rounded-2xl flex items-center justify-center mb-6"
                    style={{ width: 64, height: 64, background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.15)" }}
                  >
                    <Calculator className="text-orange-400/50" size={28} />
                  </div>
                  <h3 className="text-lg font-semibold text-white/70">Ready for Analysis</h3>
                  <p className="text-white/30 max-w-sm mt-2 text-sm leading-relaxed">
                    Select a location on the map, configure your system parameters, and click Run Analysis to generate a comprehensive IEC 61724 yield report.
                  </p>
                  <div className="mt-6 flex items-center gap-2 text-xs" style={{ color: "rgba(249,115,22,0.5)" }}>
                    <Satellite size={12} />
                    Real-time NASA POWER satellite irradiance data
                  </div>
                </Card>
              )}
            </div>
          </div>
        </main>

        <footer
          className="py-5 px-6 text-center"
          style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(5,2,12,0.6)",
          }}
        >
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
              <Satellite size={11} className="text-orange-400/40" />
              Irradiance data provided by NASA POWER (Prediction Of Worldwide Energy Resources) Climatology API
            </div>
            <div className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
              <span className="text-white/35 font-semibold tracking-wider">BU SOLARIS</span>
              &nbsp;·&nbsp;
              Developed by Barcelona · Luz · Ibañez
              &nbsp;·&nbsp;
              Bicol University
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
