"use client"

import { useState } from "react"
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"

const STATE_NAMES: Record<string, string> = {
  "01": "Alabama",
  "02": "Alaska",
  "04": "Arizona",
  "05": "Arkansas",
  "06": "California",
  "08": "Colorado",
  "09": "Connecticut",
  "10": "Delaware",
  "11": "District of Columbia",
  "12": "Florida",
  "13": "Georgia",
  "15": "Hawaii",
  "16": "Idaho",
  "17": "Illinois",
  "18": "Indiana",
  "19": "Iowa",
  "20": "Kansas",
  "21": "Kentucky",
  "22": "Louisiana",
  "23": "Maine",
  "24": "Maryland",
  "25": "Massachusetts",
  "26": "Michigan",
  "27": "Minnesota",
  "28": "Mississippi",
  "29": "Missouri",
  "30": "Montana",
  "31": "Nebraska",
  "32": "Nevada",
  "33": "New Hampshire",
  "34": "New Jersey",
  "35": "New Mexico",
  "36": "New York",
  "37": "North Carolina",
  "38": "North Dakota",
  "39": "Ohio",
  "40": "Oklahoma",
  "41": "Oregon",
  "42": "Pennsylvania",
  "44": "Rhode Island",
  "45": "South Carolina",
  "46": "South Dakota",
  "47": "Tennessee",
  "48": "Texas",
  "49": "Utah",
  "50": "Vermont",
  "51": "Virginia",
  "53": "Washington",
  "54": "West Virginia",
  "55": "Wisconsin",
  "56": "Wyoming",
}

interface USInteractiveMapProps {
  selectedState?: string | null
  onStateSelect?: (stateName: string | null) => void
}

export function USInteractiveMap({ selectedState, onStateSelect }: USInteractiveMapProps) {
  const [hoveredState, setHoveredState] = useState<string | null>(null)

  const handleStateClick = (geo: { id: string }) => {
    const name = STATE_NAMES[geo.id] ?? geo.id
    if (onStateSelect) {
      onStateSelect(selectedState === name ? null : name)
    }
  }

  const getStateFill = (geoId: string) => {
    const name = STATE_NAMES[geoId]
    if (selectedState && selectedState === name) return "hsl(var(--rip-red, 0 72% 51%))"
    if (hoveredState === name) return "hsl(var(--foreground) / 0.15)"
    return "hsl(var(--foreground) / 0.08)"
  }

  return (
    <TooltipProvider delayDuration={0}>
      <ComposableMap
        projection="geoAlbersUsa"
        className="w-full h-full"
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const name = STATE_NAMES[geo.id] ?? geo.id
                const isSelected = selectedState === name
                const isHovered = hoveredState === name
                return (
                  <Tooltip key={geo.rsmKey}>
                    <TooltipTrigger asChild>
                      <Geography
                        geography={geo}
                        fill={getStateFill(geo.id)}
                        stroke="hsl(var(--background))"
                        strokeWidth={1.5}
                        style={{
                          default: { outline: "none", cursor: "pointer", transition: "fill 0.15s ease" },
                          hover: { outline: "none", cursor: "pointer" },
                          pressed: { outline: "none" },
                        }}
                        onClick={() => handleStateClick(geo)}
                        onMouseEnter={() => setHoveredState(name)}
                        onMouseLeave={() => setHoveredState(null)}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs font-medium">
                      {name}
                      {isSelected && " — selected"}
                    </TooltipContent>
                  </Tooltip>
                )
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>
    </TooltipProvider>
  )
}
