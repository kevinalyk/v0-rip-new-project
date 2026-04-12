"use client"

import { useState } from "react"
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps"
// Note: using a custom fixed-position tooltip instead of Radix TooltipProvider to avoid SVG foreignObject issues

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

// RIP brand colors as hex for SVG fill (SVG doesn't support oklch)
const RIP_RED         = "#EB3847"
const RIP_RED_HOVER   = "rgba(235,56,71,0.45)"
const RIP_RED_DEFAULT = "rgba(235,56,71,0.12)"
const RIP_BLUE_STROKE = "rgba(55,98,127,0.5)"

export function USInteractiveMap({ selectedState, onStateSelect }: USInteractiveMapProps) {
  const [hoveredState, setHoveredState] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ name: string; x: number; y: number } | null>(null)

  const handleStateClick = (geo: { id: string }) => {
    const name = STATE_NAMES[geo.id] ?? geo.id
    if (onStateSelect) {
      onStateSelect(selectedState === name ? null : name)
    }
  }

  const getStateFill = (geoId: string) => {
    const name = STATE_NAMES[geoId]
    if (selectedState && selectedState === name) return RIP_RED
    if (hoveredState === name) return RIP_RED_HOVER
    return RIP_RED_DEFAULT
  }

  return (
    <div className="relative w-full h-full">
      <ComposableMap
        projection="geoAlbersUsa"
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const name = STATE_NAMES[geo.id] ?? geo.id
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={getStateFill(geo.id)}
                    stroke={RIP_BLUE_STROKE}
                    strokeWidth={0.6}
                    style={{
                      default: { outline: "none", cursor: "pointer", transition: "fill 0.12s ease" },
                      hover:   { outline: "none", cursor: "pointer" },
                      pressed: { outline: "none" },
                    }}
                    onClick={() => handleStateClick(geo)}
                    onMouseEnter={(e) => {
                      setHoveredState(name)
                      setTooltip({ name, x: e.clientX, y: e.clientY })
                    }}
                    onMouseMove={(e) => {
                      setTooltip({ name, x: e.clientX, y: e.clientY })
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
        </ZoomableGroup>
      </ComposableMap>

      {/* Custom tooltip — fixed position follows cursor */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none px-2.5 py-1 rounded text-xs font-medium bg-popover border border-border text-popover-foreground shadow-md"
          style={{ left: tooltip.x + 12, top: tooltip.y - 32 }}
        >
          {tooltip.name}
          {selectedState === tooltip.name && (
            <span className="ml-1.5 text-[oklch(0.62_0.22_20)]">selected</span>
          )}
        </div>
      )}
    </div>
  )
}
