// ============================================================================
// Cover Analysis Modal - Displays KDP cover validation results
// ============================================================================

import { X, CheckCircle, XCircle, AlertTriangle, Lightbulb, ChevronDown, ChevronUp } from "lucide-react"
import { useState } from "react"
import { Button } from "../../Button"
import { Card, CardContent } from "../../Card"
import { cn } from "@/lib/utils"
import { CoverAnalysisResult, CoverIssue } from "../utils/coverAnalyzer"

interface CoverAnalysisModalProps {
  result: CoverAnalysisResult
  onClose: () => void
}

export function CoverAnalysisModal({ result, onClose }: CoverAnalysisModalProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['critical', 'warnings'])
  )

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(section)) {
      newExpanded.delete(section)
    } else {
      newExpanded.add(section)
    }
    setExpandedSections(newExpanded)
  }

  const getScoreColor = (score: number): string => {
    if (score >= 90) return "text-green-500"
    if (score >= 70) return "text-yellow-500"
    if (score >= 50) return "text-orange-500"
    return "text-red-500"
  }

  const getScoreDescription = (score: number): string => {
    if (score >= 90) return "Excellent"
    if (score >= 70) return "Good"
    if (score >= 50) return "Needs Improvement"
    return "Poor"
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--color-surface)] rounded-lg shadow-2xl border border-[var(--color-border)] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            {result.approved ? (
              <CheckCircle className="w-8 h-8 text-green-500" />
            ) : (
              <XCircle className="w-8 h-8 text-red-500" />
            )}
            <div>
              <h2 className="text-xl font-bold text-[var(--color-text)]">
                Cover Analysis Results
              </h2>
              <p className="text-sm text-[var(--color-text-dim)]">
                {result.approved ? "Ready for KDP upload" : "Issues found - please review"}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Score Card */}
        <div className="px-6 py-4 bg-[var(--color-background)]">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-baseline gap-3">
                <span className={cn("text-5xl font-bold", getScoreColor(result.score))}>
                  {result.score}
                </span>
                <span className="text-xl text-[var(--color-text-dim)]">/100</span>
              </div>
              <p className="text-sm text-[var(--color-text-dim)] mt-1">
                {getScoreDescription(result.score)}
              </p>
            </div>
            
            <div className="flex gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-red-500">
                  {result.criticalErrors.length}
                </div>
                <div className="text-xs text-[var(--color-text-dim)]">Critical</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-500">
                  {result.warnings.length}
                </div>
                <div className="text-xs text-[var(--color-text-dim)]">Warnings</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">
                  {result.suggestions.length}
                </div>
                <div className="text-xs text-[var(--color-text-dim)]">Suggestions</div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Approval Status */}
          {result.approved ? (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-sm font-semibold text-green-500 mb-1">
                      ✅ COVER APPROVED FOR KDP
                    </h4>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      All critical requirements have been met. Your cover is ready for upload to Amazon KDP.
                    </p>
                    
                    {/* Key Requirements Met */}
                    <div className="mt-3 space-y-1">
                      <div className="text-xs text-[var(--color-text-dim)]">✓ Dimensions: {result.details.dimensions.expectedWidth.toFixed(3)}" × {result.details.dimensions.expectedHeight.toFixed(3)}"</div>
                      <div className="text-xs text-[var(--color-text-dim)]">✓ Resolution: {result.details.resolution.actualDPI} DPI</div>
                      {result.details.bleed.passed && (
                        <div className="text-xs text-[var(--color-text-dim)]">✓ Bleed: Complete</div>
                      )}
                      {result.details.safeZone.passed && (
                        <div className="text-xs text-[var(--color-text-dim)]">✓ Safe zones: All content within bounds</div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-sm font-semibold text-red-500 mb-1">
                      ❌ COVER WILL BE REJECTED
                    </h4>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      {result.criticalErrors.length} critical {result.criticalErrors.length === 1 ? 'issue' : 'issues'} must be fixed before uploading to KDP.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Critical Errors */}
          {result.criticalErrors.length > 0 && (
            <IssueSection
              title="Critical Issues"
              count={result.criticalErrors.length}
              issues={result.criticalErrors}
              icon={<XCircle className="w-5 h-5 text-red-500" />}
              color="red"
              expanded={expandedSections.has('critical')}
              onToggle={() => toggleSection('critical')}
            />
          )}

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <IssueSection
              title="Warnings"
              count={result.warnings.length}
              issues={result.warnings}
              icon={<AlertTriangle className="w-5 h-5 text-yellow-500" />}
              color="yellow"
              expanded={expandedSections.has('warnings')}
              onToggle={() => toggleSection('warnings')}
            />
          )}

          {/* Suggestions */}
          {result.suggestions.length > 0 && (
            <IssueSection
              title="Suggestions for Improvement"
              count={result.suggestions.length}
              issues={result.suggestions}
              icon={<Lightbulb className="w-5 h-5 text-blue-400" />}
              color="blue"
              expanded={expandedSections.has('suggestions')}
              onToggle={() => toggleSection('suggestions')}
            />
          )}

          {/* Technical Details */}
          <Card className="border-[var(--color-border)] bg-[var(--color-surface)]">
            <CardContent className="py-4">
              <button
                onClick={() => toggleSection('details')}
                className="w-full flex items-center justify-between text-left"
              >
                <h4 className="text-sm font-semibold text-[var(--color-text)]">
                  Technical Details
                </h4>
                {expandedSections.has('details') ? (
                  <ChevronUp className="w-4 h-4 text-[var(--color-text-dim)]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[var(--color-text-dim)]" />
                )}
              </button>
              
              {expandedSections.has('details') && (
                <div className="mt-4 space-y-3 text-xs text-[var(--color-text-muted)]">
                  <DetailRow label="Cover Width" value={`${result.details.dimensions.expectedWidth.toFixed(3)}"`} />
                  <DetailRow label="Cover Height" value={`${result.details.dimensions.expectedHeight.toFixed(3)}"`} />
                  <DetailRow label="Spine Width" value={`${result.details.spine.spineWidth.toFixed(3)}"`} />
                  <DetailRow label="Resolution" value={`${result.details.resolution.actualDPI} DPI`} />
                  <DetailRow label="Bleed Margin" value={`${result.details.bleed.bleedMargin}"`} />
                  <DetailRow label="Safe Zone Margin" value={`${result.details.safeZone.safeZoneMargin}"`} />
                  <DetailRow label="Text Elements" value={`${result.details.textElements.length}`} />
                  <DetailRow label="Images" value={`${result.details.imageElements.length}`} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex justify-between items-center">
          <p className="text-xs text-[var(--color-text-dim)]">
            Analysis based on Amazon KDP specifications
          </p>
          <Button onClick={onClose} variant="primary">
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

interface IssueSectionProps {
  title: string
  count: number
  issues: CoverIssue[]
  icon: React.ReactNode
  color: 'red' | 'yellow' | 'blue'
  expanded: boolean
  onToggle: () => void
}

function IssueSection({ title, count, issues, icon, color, expanded, onToggle }: IssueSectionProps) {
  const colorClasses = {
    red: {
      border: 'border-red-500/30',
      bg: 'bg-red-500/5',
      text: 'text-red-500',
    },
    yellow: {
      border: 'border-yellow-500/30',
      bg: 'bg-yellow-500/5',
      text: 'text-yellow-500',
    },
    blue: {
      border: 'border-blue-400/30',
      bg: 'bg-blue-400/5',
      text: 'text-blue-400',
    },
  }

  const colors = colorClasses[color]

  return (
    <Card className={cn(colors.border, colors.bg)}>
      <CardContent className="py-4">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            {icon}
            <div>
              <h4 className={cn("text-sm font-semibold", colors.text)}>
                {title} ({count})
              </h4>
            </div>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-[var(--color-text-dim)]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--color-text-dim)]" />
          )}
        </button>

        {expanded && (
          <div className="mt-4 space-y-3">
            {issues.map((issue, index) => (
              <IssueItem key={index} issue={issue} index={index} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface IssueItemProps {
  issue: CoverIssue
  index: number
}

function IssueItem({ issue, index }: IssueItemProps) {
  return (
    <div className="p-3 bg-[var(--color-background)] rounded border border-[var(--color-border)]">
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-[var(--color-surface)] flex items-center justify-center text-xs font-bold text-[var(--color-text-dim)]">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <h5 className="text-sm font-medium text-[var(--color-text)] mb-1">
            {issue.message}
          </h5>
          <p className="text-xs text-[var(--color-text-muted)] mb-2">
            {issue.details}
          </p>
          {issue.fix && (
            <div className="flex items-start gap-2 p-2 bg-[var(--color-surface)] rounded border border-[var(--color-border)]">
              <Lightbulb className="w-3 h-3 text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-[var(--color-text-dim)]">
                <span className="font-semibold text-blue-400">Fix:</span> {issue.fix}
              </p>
            </div>
          )}
          {issue.position && (
            <div className="mt-2 text-xs text-[var(--color-text-dim)]">
              Position: ({Math.round(issue.position.x)}px, {Math.round(issue.position.y)}px)
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface DetailRowProps {
  label: string
  value: string
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex justify-between py-1 border-b border-[var(--color-border)]">
      <span className="text-[var(--color-text-dim)]">{label}:</span>
      <span className="font-mono text-[var(--color-text)]">{value}</span>
    </div>
  )
}
