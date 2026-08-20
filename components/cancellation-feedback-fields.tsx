"use client"

import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"

export const CANCELLATION_REASONS = [
  { value: "too_expensive", label: "Too expensive" },
  { value: "not_using", label: "Not using it enough" },
  { value: "missing_features", label: "Missing features we need" },
  { value: "switching_competitor", label: "Switching to a different tool" },
  { value: "poor_support", label: "Poor support experience" },
  { value: "other", label: "Other" },
] as const

export type CancellationReason = (typeof CANCELLATION_REASONS)[number]["value"]

interface CancellationFeedbackFieldsProps {
  reason: string
  onReasonChange: (value: string) => void
  comment: string
  onCommentChange: (value: string) => void
}

export function CancellationFeedbackFields({
  reason,
  onReasonChange,
  comment,
  onCommentChange,
}: CancellationFeedbackFieldsProps) {
  return (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Why are you cancelling? (optional)</Label>
        <RadioGroup value={reason} onValueChange={onReasonChange} className="gap-2">
          {CANCELLATION_REASONS.map((option) => (
            <div key={option.value} className="flex items-center gap-2">
              <RadioGroupItem value={option.value} id={`cancel-reason-${option.value}`} />
              <Label htmlFor={`cancel-reason-${option.value}`} className="text-sm font-normal cursor-pointer">
                {option.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>
      <div className="space-y-2">
        <Label htmlFor="cancel-comment" className="text-sm font-medium">
          Anything else you&apos;d like us to know?
        </Label>
        <Textarea
          id="cancel-comment"
          placeholder="Optional feedback..."
          value={comment}
          onChange={(e) => onCommentChange(e.target.value)}
          rows={3}
        />
      </div>
    </div>
  )
}
