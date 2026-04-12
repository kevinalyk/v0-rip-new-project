"use client"

import { useState } from "react"
import { ComposableMap, Geographies, Geography } from "react-simple-maps"

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"

// State fill constants — dark intel/dashboard palette
// Dark navy tiles so future RIP red activity dots pop sharply against them
const FILL_DEFAULT  = "#1c2133"   // dark navy — matches dark sidebar tone
const FILL_HOVER    = "#2a3150"   // lifted navy on hover
const FILL_SELECTED = "#EB3847"   // solid RIP red for selected state
const STROKE_DEFAULT  = "#3d4b6e" // visible blue-grey border between states
const STROKE_SELECTED = "#ff6472" // lighter red border on selected state

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
}

export function USInteractiveMap({ selectedState, onStateSelect }: USInteractiveMapProps) {
  const [hoveredState, setHoveredState] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ name: string; x: number; y: number } | null>(null)

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
      </ComposableMap>

      {/* Fixed cursor-following tooltip — avoids SVG foreignObject issues */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none rounded px-2.5 py-1 text-xs font-medium shadow-lg"
          style={{
            left: tooltip.x + 14,
            top: tooltip.y - 38,
            background: "#1c2133",
            border: "1px solid #3d4b6e",
            color: "#e2e8f0",
          }}
        >
          {tooltip.name}
          {selectedState === tooltip.name && (
            <span className="ml-1.5" style={{ color: "#EB3847" }}>selected</span>
          )}
        </div>
      )}
    </div>
  )
}
