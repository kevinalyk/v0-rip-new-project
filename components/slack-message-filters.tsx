"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { US_STATES } from "@/lib/slack-message-filters"

export interface SlackMessageFilterValues {
  messageTypeFilter: string
  houseFileFilter: string
  partyFilter: string
  stateFilter: string
  entityTypeFilter: string
}

interface SlackMessageFiltersProps {
  values: SlackMessageFilterValues
  onChange: (values: SlackMessageFilterValues) => void
  disabled?: boolean
}

// Same five filter dimensions as the CI Feed (components/competitive-insights.tsx), applied
// to real-time Slack alerts on top of the entity allow-list (SlackEntityPicker). Each select
// is independent - a message must pass all five to be posted. Values match lib/slack-message-filters.ts.
export function SlackMessageFilters({ values, onChange, disabled }: SlackMessageFiltersProps) {
  const set = <K extends keyof SlackMessageFilterValues>(key: K, value: string) =>
    onChange({ ...values, [key]: value })

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Channel</p>
        <Select value={values.messageTypeFilter} onValueChange={(v) => set("messageTypeFilter", v)} disabled={disabled}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All messages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All messages</SelectItem>
            <SelectItem value="email">Email only</SelectItem>
            <SelectItem value="sms">Text only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">House file / third party</p>
        <Select value={values.houseFileFilter} onValueChange={(v) => set("houseFileFilter", v)} disabled={disabled}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="house_file">House file only</SelectItem>
            <SelectItem value="third_party">Third party only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Party</p>
        <Select value={values.partyFilter} onValueChange={(v) => set("partyFilter", v)} disabled={disabled}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All parties" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All parties</SelectItem>
            <SelectItem value="republican">Republican</SelectItem>
            <SelectItem value="democrat">Democrat</SelectItem>
            <SelectItem value="third party">Independent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">State</p>
        <Select value={values.stateFilter} onValueChange={(v) => set("stateFilter", v)} disabled={disabled}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All states" />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            <SelectItem value="all">All states</SelectItem>
            {US_STATES.map((state) => (
              <SelectItem key={state} value={state}>
                {state}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Entity type</p>
        <Select value={values.entityTypeFilter} onValueChange={(v) => set("entityTypeFilter", v)} disabled={disabled}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="politician">Politicians</SelectItem>
            <SelectItem value="pac">PACs</SelectItem>
            <SelectItem value="organization">Organizations</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
