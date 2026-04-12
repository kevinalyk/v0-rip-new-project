"use client"

import { useState } from "react"
import { ComposableMap, Geographies, Geography } from "react-simple-maps"

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"

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

// State fill: dark slate tiles with RIP red accent on interaction
// Designed so future activity dots (bright RIP red) pop against the dark fills
const STATE_DEFAULT  = "#1e2433"   // dark navy-slate — matches dark sidebar tone
const STATE_HOVER    = "#2d3548"   // slightly lighter slate
const STATE_SELECTED = "#EB3847"   // full RIP red
const STROKE_COLOR   = "#3a4257"   // subtle border, same family as fills

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
    if (selectedState === name) return STATE_SELECTED
    if (hoveredState === name) return STATE_HOVER
    return STATE_DEFAULT
  }

  const getStrokeColor = (geoId: string) => {
    const name = STATE_NAMES[geoId]
    if (selectedState === name) return "#ff6b7a"   // lighter red border on selected
    return STROKE_COLOR
  }

  return (
    <div className="relative w-full h-full">
      {/* Subtle grid background — intel/dashboard feel */}
      <div
        className="absolute inset-0 rounded-lg opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(235,56,71,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(235,56,71,0.06) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <ComposableMap
        projection="geoAlbersUsa"
        style={{ width: "100%", height: "100%", position: "relative" }}
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
                  stroke={getStrokeColor(geo.id)}
                  strokeWidth={selectedState === name ? 1.5 : 0.8}
                  style={{
                    default: { outline: "none", cursor: "pointer" },
                    hover:   { outline: "none", cursor: "pointer" },
                    pressed: { outline: "none" },
                  }}
                  onClick={() => handleStateClick(geo.id)}
                  onMouseEnter={(e) => {
                    setHoveredState(name)
                    setTooltip({ name, x: e.clientX, y: e.clientY })
                  }}
                  onMouseMove={(e) => {
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

      {/* Fixed-position tooltip that follows the cursor */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none px-2.5 py-1 rounded text-xs font-medium shadow-lg"
          style={{
            left: tooltip.x + 14,
            top: tooltip.y - 36,
            background: "#1e2433",
            border: "1px solid #3a4257",
            color: "#e2e8f0",
          }}
        >
          {tooltip.name}
          {selectedState === tooltip.name && (
            <span className="ml-1.5" style={{ color: "#EB3847" }}>&#x2713;</span>
          )}
        </div>
      )}
    </div>
  )
}
