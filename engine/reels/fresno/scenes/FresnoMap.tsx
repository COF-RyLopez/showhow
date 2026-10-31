// The fresno reel's map: north Fresno where three CAD/PSAP areas meet, drawn by MapLibre GL from the real County of
// Fresno and OpenAddresses layers in ../assets (made by ../fetch.py). It is the reel's __overlay, so one map lives for
// the whole reel and every scene change is continuous. The map is rendered once as a fixed plate at the closest zoom;
// the camera is a CSS transform of that plate (no per-frame map camera, so no shimmer). Pins, labels and cards are
// HTML on top, placed with the same transform.
//   hook    the three areas fill in turn, then centerlines and address points ripple out
//   paula   push in to two neighbors on Paula Ave: 7503 N (FRESNO, FR) and 7465 N (FRESNO COUNTY island, SO, mail CLOVIS)
//   willow  slide east to 7518 N Willow Ave (CLOVIS, CL); pull back on "location"; the mail tag is struck on "city"
import * as maplibregl from "maplibre-gl";
import { type Map as LMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Easing, interpolate, staticFile, useCurrentFrame, useDelayRender } from "remotion";
import { spline, useReel } from "../../../src/engine";

const W = 1080, H = 1920;
const PLATE = { w: 2700, h: 3840 };
const CENTER: [number, number] = [-119.7316, 36.8452];
const BASE_ZOOM = 16.4;                         // the closest zoom any frame reaches (MapLibre, 512 px tiles: ~0.72 m a pixel)
const INK = "#14213D", GREY = "#5B6478";
const AREA = { FRESNO: "#2B7EF9", "FRESNO COUNTY": "#D97757", CLOVIS: "#3BA676" } as const;
type AreaName = keyof typeof AREA;
// three addresses that both county layers agree on, each 30+ m from any boundary (see the PR for the check)
const PINS: { at: [number, number]; addr: string; area: AreaName; code: string; mail?: string; below?: boolean; side: -1 | 0 | 1 }[] = [
  { at: [-119.733432, 36.845094], addr: "7503 N Paula Ave", area: "FRESNO", code: "FR", side: -1 },
  { at: [-119.733645, 36.844415], addr: "7465 N Paula Ave", area: "FRESNO COUNTY", code: "SO", mail: "CLOVIS", below: true, side: 0 },
  { at: [-119.729346, 36.845472], addr: "7518 N Willow Ave", area: "CLOVIS", code: "CL", side: 1 },
];
const PAULA: [number, number] = [-119.73354, 36.84475];
const ALL3: [number, number] = [-119.7315, 36.84495];
const ease = Easing.bezier(0.645, 0.045, 0.355, 1);
const at = (s: number, a: number, b: number, e = ease) => interpolate(s, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: e });
const style: maplibregl.StyleSpecification = { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#FFFFFF" } }] };
const asset = (f: string) => staticFile(`fresno/${f}`);
const font = "Inter, sans-serif";

function useTimes() {
  const { tl } = useReel();
  return useMemo(() => {
    const c = (w: string, n = 1) => tl.cue(w, n) / tl.fps;
    return { fresno: c("fresno"), agencies: c("agencies"), blocks: c("blocks"), neighbors: c("neighbors"), fresno2: c("fresno", 2),
      island: c("island"), clovis: c("clovis"), willow: c("willow"), clovis2: c("clovis", 2), location: c("location"), city: c("city"), end: tl.frames / tl.fps };
  }, [tl]);
}

export const FresnoMap: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const { tl } = useReel();
  const s = useCurrentFrame() / tl.fps;
  const t = useTimes();
  const { delayRender, continueRender } = useDelayRender();
  const [map, setMap] = useState<LMap | null>(null);
  const [handle] = useState(() => delayRender("Loading the Fresno map"));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const get = (n: string) => fetch(asset(`${n}.geojson`)).then((r) => r.json());
    Promise.all(["cad", "centerlines", "addresses"].map(get)).then(([cad, cl, pts]) => {
      maplibregl.setWorkerUrl(asset("maplibre-gl-worker.mjs"));   // served from the reel's assets, not a CDN
      const m = new maplibregl.Map({ container: el, style, center: CENTER, zoom: BASE_ZOOM, interactive: false, attributionControl: false,
        fadeDuration: 0, canvasContextAttributes: { preserveDrawingBuffer: true } });
      m.on("load", () => {
        const color = ["match", ["get", "NAME"], "FRESNO", AREA.FRESNO, "FRESNO COUNTY", AREA["FRESNO COUNTY"], AREA.CLOVIS] as maplibregl.ExpressionSpecification;
        m.addSource("cad", { type: "geojson", data: cad });
        m.addLayer({ id: "cad-fill", type: "fill", source: "cad", paint: { "fill-color": color, "fill-opacity": 0 } });
        m.addSource("cl", { type: "geojson", data: cl });
        m.addLayer({ id: "streets", type: "line", source: "cl", paint: { "line-color": "#E4E7EE", "line-width": 20 }, layout: { "line-cap": "round" } });
        m.addLayer({ id: "cl", type: "line", source: "cl", filter: ["<", ["get", "d"], 0], paint: { "line-color": INK, "line-width": 4 }, layout: { "line-cap": "round" } });
        m.addSource("pts", { type: "geojson", data: pts });
        m.addLayer({ id: "pts", type: "circle", source: "pts", filter: ["<", ["get", "d"], 0], paint: { "circle-color": GREY, "circle-radius": 4 } });
        m.addLayer({ id: "cad-line", type: "line", source: "cad", paint: { "line-color": color, "line-width": 5, "line-opacity": 0 } });
        m.once("idle", () => { setMap(m); continueRender(handle); });
      });
    });
  }, [continueRender, handle]);

  // per frame only data filters and paint change; the map camera never moves
  useEffect(() => {
    if (!map) return;
    const h = delayRender("Fresno frame");
    const show = (i: number) => at(s, t.agencies - 0.3 + i * 0.25, t.agencies + 0.3 + i * 0.25);       // the areas fill in turn
    const lit = { FRESNO: at(s, t.fresno2 - 0.2, t.fresno2 + 0.3), "FRESNO COUNTY": at(s, t.island - 0.2, t.island + 0.3), CLOVIS: at(s, t.clovis2 - 0.2, t.clovis2 + 0.3) };
    const pulse = at(s, t.location - 0.2, t.location + 0.3) * (1 - 0.6 * at(s, t.location + 0.6, t.location + 1.4));
    const fill = (n: AreaName, i: number) => 0.1 * show(i) + 0.1 * lit[n] + 0.12 * pulse;
    map.setPaintProperty("cad-fill", "fill-opacity", ["match", ["get", "NAME"], "FRESNO", fill("FRESNO", 0), "FRESNO COUNTY", fill("FRESNO COUNTY", 1), fill("CLOVIS", 2)]);
    map.setPaintProperty("cad-line", "line-opacity", at(s, t.fresno - 0.2, t.fresno + 0.5));
    map.setPaintProperty("cad-line", "line-width", 5 + 5 * pulse);
    map.setFilter("cl", ["<", ["get", "d"], 1500 * at(s, t.blocks - 0.6, t.blocks + 1.2, Easing.out(Easing.cubic))]);
    map.setFilter("pts", ["<", ["get", "d"], 1500 * at(s, t.blocks - 0.2, t.blocks + 1.6, Easing.out(Easing.cubic))]);
    map.once("idle", () => continueRender(h));
    map.triggerRepaint();
  }, [map, s, t, delayRender, continueRender]);

  // the camera: centre and zoom keyed to word cues, applied as a CSS transform of the fixed plate
  const lon = spline(s, [[0, CENTER[0]], [t.neighbors - 0.3, CENTER[0]], [t.neighbors + 1.3, PAULA[0]], [t.willow - 0.3, PAULA[0]], [t.willow + 1.0, ALL3[0]], [t.end, ALL3[0]]]);
  const lat = spline(s, [[0, CENTER[1]], [t.neighbors - 0.3, CENTER[1]], [t.neighbors + 1.3, PAULA[1]], [t.willow - 0.3, PAULA[1]], [t.willow + 1.0, ALL3[1]], [t.end, ALL3[1]]]);
  const zoom = spline(s, [[0, 15.42], [t.neighbors - 0.3, 15.5], [t.neighbors + 1.3, 16.4], [t.willow - 0.3, 16.4], [t.willow + 1.0, 16.12], [t.location - 0.2, 16.1], [t.location + 1.1, 15.85], [t.end, 15.8]]);
  const scale = 2 ** (zoom - BASE_ZOOM);
  const c = map ? map.project([lon, lat]) : { x: PLATE.w / 2, y: PLATE.h / 2 };
  const tx = W / 2 - c.x * scale, ty = H / 2 - c.y * scale;
  const screen = (p: [number, number]) => { const q = map ? map.project(p) : { x: 0, y: 0 }; return { x: q.x * scale + tx, y: q.y * scale + ty }; };

  const dropAt = [t.neighbors, t.neighbors + 0.18, t.willow];
  const cardAt = [t.fresno2, t.island, t.clovis2];
  const legend = at(s, t.agencies - 0.2, t.agencies + 0.4) * (1 - at(s, t.neighbors - 0.4, t.neighbors + 0.2));
  const title = 1 - at(s, t.agencies - 0.6, t.agencies);
  const mail = at(s, t.clovis - 0.2, t.clovis + 0.3), strike = at(s, t.city - 0.15, t.city + 0.3);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#FFFFFF" }}>
      <div style={{ position: "absolute", width: PLATE.w, height: PLATE.h, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}>
        <div ref={ref} style={{ width: PLATE.w, height: PLATE.h }} />
      </div>
      {PINS.map((p, i) => {
        const q = screen(p.at), d = at(s, dropAt[i] - 0.05, dropAt[i] + 0.45, Easing.out(Easing.back(1.6)));
        if (d <= 0) return null;
        const card = at(s, cardAt[i] - 0.2, cardAt[i] + 0.3), col = AREA[p.area], ripple = ((s - dropAt[i]) % 1.4) / 1.4;
        // cards sit to the side away from their neighbours (-1 left of the pin, 1 right, 0 centred), kept on screen
        const left = Math.min(W - 30 - 440, Math.max(30, p.side === -1 ? q.x + 40 - 440 : p.side === 1 ? q.x - 40 : q.x - 220));
        return (
          <React.Fragment key={p.addr}>
            <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
              <circle cx={q.x} cy={q.y} r={14 + 70 * ripple} fill="none" stroke={col} strokeWidth={5} opacity={(1 - ripple) * 0.7} />
              <g transform={`translate(${q.x}, ${q.y - 50 * (1 - d)})`} opacity={Math.min(1, d * 2)}>
                <path d="M0 0 C-9 -20 -24 -29 -24 -48 A24 24 0 1 1 24 -48 C24 -29 9 -20 0 0 Z" fill={col} stroke="#fff" strokeWidth={3} />
                <circle cx={0} cy={-49} r={9} fill="#fff" />
              </g>
            </svg>
            {card > 0 && (
              <div style={{ position: "absolute", left, width: 440, top: p.below ? q.y + 26 : q.y - 236, opacity: card,
                transform: `translateY(${(p.below ? -1 : 1) * 16 * (1 - card)}px)`, background: "#fff", borderRadius: 20, padding: "18px 24px",
                borderLeft: `10px solid ${col}`, boxShadow: "0 12px 30px rgba(20,33,61,0.18)", fontFamily: font }}>
                <div style={{ fontSize: 34, fontWeight: 800, color: INK }}>{p.addr}</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: col, marginTop: 4, whiteSpace: "nowrap" }}>{p.area} · {p.code}</div>
                {p.mail && mail > 0 && (
                  <div style={{ display: "inline-block", marginTop: 8, opacity: mail * (1 - 0.55 * strike), fontSize: 32, fontWeight: 600, color: GREY,
                    background: "#F4F6FA", borderRadius: 10, padding: "2px 12px", textDecoration: strike > 0.5 ? "line-through" : "none" }}>mail: {p.mail}</div>
                )}
              </div>
            )}
          </React.Fragment>
        );
      })}
      <div style={{ position: "absolute", top: 120, left: 140, right: 140, padding: "24px 0", borderRadius: 24, background: "rgba(255,255,255,0.95)",
        boxShadow: "0 10px 30px rgba(20,33,61,0.12)", textAlign: "center", fontFamily: font, color: INK, opacity: title }}>
        <div style={{ fontSize: 60, fontWeight: 800 }}>North Fresno</div>
        <div style={{ fontSize: 34, fontWeight: 600, color: GREY, marginTop: 8 }}>CAD/PSAP areas, County of Fresno</div>
      </div>
      <div style={{ position: "absolute", top: 140, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 16, opacity: legend, fontFamily: font }}>
        {(Object.keys(AREA) as AreaName[]).map((n, i) => (
          <div key={n} style={{ background: "#fff", borderRadius: 14, padding: "10px 18px", fontSize: 32, fontWeight: 700, color: INK,
            boxShadow: "0 8px 20px rgba(20,33,61,0.12)", borderLeft: `10px solid ${AREA[n]}`, opacity: at(s, t.agencies - 0.3 + i * 0.25, t.agencies + 0.2 + i * 0.25) }}>{n}</div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 140, right: 140, bottom: 90, padding: "12px 0", borderRadius: 16, background: "rgba(255,255,255,0.95)",
        fontFamily: font, fontSize: 32, fontWeight: 600, color: GREY, textAlign: "center" }}>County of Fresno GIS · OpenAddresses</div>
    </div>
  );
};
