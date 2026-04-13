"use client"

import { useState } from "react"
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps"

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"

// State fill constants — dark intel/dashboard palette
// Dark navy tiles so future RIP red activity dots pop sharply against them
const FILL_DEFAULT  = "#1c2133"   // dark navy — matches dark sidebar tone
const FILL_HOVER    = "#2a3150"   // lifted navy on hover
const FILL_SELECTED = "#EB3847"   // solid RIP red for selected state
const STROKE_DEFAULT  = "#3d4b6e" // visible blue-grey border between states
const STROKE_SELECTED = "#ff6472" // lighter red border on selected state

// Reverse map: state abbreviation -> full name (used for tooltip activity lookup)
const ABBREV_TO_FULL: Record<string, string> = {
  AL:"Alabama", AK:"Alaska", AZ:"Arizona", AR:"Arkansas", CA:"California",
  CO:"Colorado", CT:"Connecticut", DE:"Delaware", FL:"Florida", GA:"Georgia",
  HI:"Hawaii", ID:"Idaho", IL:"Illinois", IN:"Indiana", IA:"Iowa", KS:"Kansas",
  KY:"Kentucky", LA:"Louisiana", ME:"Maine", MD:"Maryland", MA:"Massachusetts",
  MI:"Michigan", MN:"Minnesota", MS:"Mississippi", MO:"Missouri", MT:"Montana",
  NE:"Nebraska", NV:"Nevada", NH:"New Hampshire", NJ:"New Jersey", NM:"New Mexico",
  NY:"New York", NC:"North Carolina", ND:"North Dakota", OH:"Ohio", OK:"Oklahoma",
  OR:"Oregon", PA:"Pennsylvania", RI:"Rhode Island", SC:"South Carolina",
  SD:"South Dakota", TN:"Tennessee", TX:"Texas", UT:"Utah", VT:"Vermont",
  VA:"Virginia", WA:"Washington", WV:"West Virginia", WI:"Wisconsin", WY:"Wyoming",
  DC:"District of Columbia",
}

// Approximate geographic centroids [longitude, latitude] for each state abbreviation
const STATE_CENTROIDS: Record<string, [number, number]> = {
  AL: [-86.9, 32.8], AK: [-153.4, 64.2], AZ: [-111.7, 34.3], AR: [-92.4, 34.9],
  CA: [-119.4, 37.2], CO: [-105.5, 39.0], CT: [-72.7, 41.6], DE: [-75.5, 39.0],
  FL: [-81.5, 27.8], GA: [-83.4, 32.7], HI: [-157.5, 20.3], ID: [-114.5, 44.4],
  IL: [-89.2, 40.0], IN: [-86.3, 39.8], IA: [-93.5, 42.1], KS: [-98.4, 38.5],
  KY: [-84.9, 37.5], LA: [-91.8, 31.2], ME: [-69.4, 45.4], MD: [-76.8, 39.0],
  MA: [-71.5, 42.2], MI: [-84.5, 44.3], MN: [-94.3, 46.4], MS: [-89.7, 32.7],
  MO: [-92.5, 38.5], MT: [-109.6, 47.0], NE: [-99.9, 41.5], NV: [-116.4, 38.8],
  NH: [-71.6, 43.7], NJ: [-74.4, 40.1], NM: [-106.1, 34.5], NY: [-75.5, 43.0],
  NC: [-79.4, 35.6], ND: [-100.5, 47.5], OH: [-82.8, 40.4], OK: [-97.5, 35.5],
  OR: [-120.5, 43.9], PA: [-77.2, 40.9], RI: [-71.5, 41.7], SC: [-81.0, 33.8],
  SD: [-100.2, 44.4], TN: [-86.7, 35.9], TX: [-99.3, 31.5], UT: [-111.1, 39.3],
  VT: [-72.7, 44.0], VA: [-79.4, 37.5], WA: [-120.5, 47.4], WV: [-80.6, 38.6],
  WI: [-89.6, 44.2], WY: [-107.6, 43.0], DC: [-77.0, 38.9],
}

export interface StateActivity {
  state: string
  emailCount: number
  smsCount: number
  total: number
  latestAt: string
}

const STATE_NAMES: Record<string, string> = {
  "01": "Alabama", "02": "Alaska", "04": "Arizona", "05": "Arkansas",
  "06": "California", "08": "Colorado", "09": "Connecticut", "10": "Delaware",
  "11": "District of Columbia", "12": "Florida", "13": "Georgia", "15": "Hawaii",
  "16": "Idaho", "17": "Illinois", "18": "Indiana", "19": "Iowa",
  "20": "Kansas", "21": "Kentucky", "22": "Louisiana", "23": "Maine",
  "24": "Maryland", "25": "Massachusetts", "26": "Michigan", "27": "Minnesota",
  "28": "Mississippi", "29": "Missouri", "30": "Montana", "31": "Nebraska",
  "32": "Nevada", "33": "New Hampshire", "34": "New Jersey", "35": "New Mexico",
  "36": "New York", "37": "North Carolina", "38": "North Dakota", "39": "Ohio",
  "40": "Oklahoma", "41": "Oregon", "42": "Pennsylvania", "44": "Rhode Island",
  "45": "South Carolina", "46": "South Dakota", "47": "Tennessee", "48": "Texas",
  "49": "Utah", "50": "Vermont", "51": "Virginia", "53": "Washington",
  "54": "West Virginia", "55": "Wisconsin", "56": "Wyoming",
}

interface USInteractiveMapProps {
  selectedState?: string | null
  onStateSelect?: (stateName: string | null) => void
  activityData?: StateActivity[]
}

export function USInteractiveMap({ selectedState, onStateSelect, activityData = [] }: USInteractiveMapProps) {
  const [hoveredState, setHoveredState] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ name: string; x: number; y: number } | null>(null)

  // Build a lookup map for fast access: state abbrev -> activity
  const activityByState = activityData.reduce<Record<string, StateActivity>>((acc, item) => {
    acc[item.state] = item
    return acc
  }, {})

  const handleStateClick = (geoId: string) => {
    const name = STATE_NAMES[geoId] ?? geoId
    if (onStateSelect) {
      onStateSelect(selectedState === name ? null : name)
    }
  }

  const getStateFill = (geoId: string) => {
    const name = STATE_NAMES[geoId]
    if (selectedState === name) return FILL_SELECTED
    if (hoveredState === name) return FILL_HOVER
    return FILL_DEFAULT
  }

  const getStroke = (geoId: string) => {
    return selectedState === STATE_NAMES[geoId] ? STROKE_SELECTED : STROKE_DEFAULT
  }

  const getStrokeWidth = (geoId: string) => {
    return selectedState === STATE_NAMES[geoId] ? 1.2 : 0.6
  }

  return (
    <div className="relative w-full h-full">
      {/* Pulse animation keyframes injected inline */}
      <style>{`
        @keyframes rip-pulse {
          0%   { r: 5; opacity: 0.9; }
          70%  { r: 13; opacity: 0; }
          100% { r: 13; opacity: 0; }
        }
        @keyframes rip-pulse-ring {
          0%   { r: 5; opacity: 0.6; }
          100% { r: 18; opacity: 0; }
        }
        .rip-dot-pulse { animation: rip-pulse 1.8s ease-out infinite; }
        .rip-dot-ring  { animation: rip-pulse-ring 1.8s ease-out infinite 0.3s; }
      `}</style>

      {/* Subtle grid overlay — gives the canvas an intel/ops-center feel */}
      <div
        className="absolute inset-0 rounded-lg pointer-events-none"
        style={{
          backgroundImage: [
            "linear-gradient(rgba(235,56,71,0.04) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(235,56,71,0.04) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "48px 48px",
        }}
      />

      <ComposableMap
        projection="geoAlbersUsa"
        style={{ width: "100%", height: "100%" }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const name = STATE_NAMES[geo.id] ?? geo.id
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={getStateFill(geo.id)}
                  stroke={getStroke(geo.id)}
                  strokeWidth={getStrokeWidth(geo.id)}
                  style={{
                    default: { outline: "none", cursor: "pointer" },
                    hover:   { outline: "none", cursor: "pointer" },
                    pressed: { outline: "none" },
                  }}
                  onClick={() => handleStateClick(geo.id)}
                  onMouseEnter={(e: React.MouseEvent) => {
                    setHoveredState(name)
                    setTooltip({ name, x: e.clientX, y: e.clientY })
                  }}
                  onMouseMove={(e: React.MouseEvent) => {
                    setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)
                  }}
                  onMouseLeave={() => {
                    setHoveredState(null)
                    setTooltip(null)
                  }}
                />
              )
            })
          }
        </Geographies>

        {/* Activity dots — one pulsing marker per active state */}
        {activityData.map((item) => {
          const coords = STATE_CENTROIDS[item.state]
          if (!coords) return null
          // Scale dot size slightly by volume (max radius 7)
          const r = Math.min(4 + Math.floor(item.total / 3), 7)
          return (
            <Marker key={item.state} coordinates={coords}>
              {/* All dot layers are pointer-events:none so clicks pass through to the Geography below */}
              {/* Outer expanding ring */}
              <circle
                className="rip-dot-ring"
                cx={0} cy={0} r={r}
                fill="none"
                stroke="#EB3847"
                strokeWidth={1.5}
                style={{ pointerEvents: "none" }}
              />
              {/* Inner pulsing fill */}
              <circle
                className="rip-dot-pulse"
                cx={0} cy={0} r={r}
                fill="#EB3847"
                fillOpacity={0.85}
                style={{ pointerEvents: "none" }}
              />
              {/* Static core dot */}
              <circle
                cx={0} cy={0} r={r * 0.5}
                fill="#ff6472"
                style={{ pointerEvents: "none" }}
              />
            </Marker>
          )
        })}
      </ComposableMap>

      {/* Fixed cursor-following tooltip — avoids SVG foreignObject issues */}
      {tooltip && (() => {
        // Activity is keyed by state abbreviation; tooltip.name is the full state name
        // Use ABBREV_TO_FULL to find the matching abbreviation
        const matchedActivity = activityData.find(
          (a) => ABBREV_TO_FULL[a.state] === tooltip.name
        )
        return (
          <div
            className="fixed z-50 pointer-events-none rounded px-2.5 py-1.5 text-xs font-medium shadow-lg"
            style={{
              left: tooltip.x + 14,
              top: tooltip.y - 42,
              background: "#1c2133",
              border: "1px solid #3d4b6e",
              color: "#e2e8f0",
            }}
          >
            <div className="font-semibold">{tooltip.name}</div>
            {matchedActivity && (
              <div className="flex gap-2 mt-0.5" style={{ color: "#94a3b8" }}>
                {matchedActivity.emailCount > 0 && (
                  <span>
                    <span style={{ color: "#EB3847" }}>{matchedActivity.emailCount}</span>
                    {" "}email{matchedActivity.emailCount !== 1 ? "s" : ""}
                  </span>
                )}
                {matchedActivity.smsCount > 0 && (
                  <span>
                    <span style={{ color: "#EB3847" }}>{matchedActivity.smsCount}</span> SMS
                  </span>
                )}
              </div>
            )}
            {selectedState === tooltip.name && (
              <div className="mt-0.5" style={{ color: "#EB3847" }}>selected</div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
