import { GraphTemplateEdge, GraphTemplateNode } from "./types"

export type WorkflowPresetId = "youtube-long" | "youtube-shorts"

export type WorkflowPreset = {
  id: WorkflowPresetId
  title: string
  subtitle: string
  templateName: string
  description: string
  guidance: string[]
  nodes: GraphTemplateNode[]
  edges: GraphTemplateEdge[]
}

function edge(fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string): GraphTemplateEdge {
  return {
    id: `edge-${fromNodeId}-${fromPortId}-${toNodeId}-${toPortId}`,
    from: { nodeId: fromNodeId, portId: fromPortId },
    to: { nodeId: toNodeId, portId: toPortId },
  }
}

function node(
  id: string,
  type: string,
  title: string,
  x: number,
  y: number,
  config: Record<string, any> = {}
): GraphTemplateNode {
  return {
    id,
    type,
    title,
    position: { x, y },
    config,
  }
}

const YOUTUBE_LONG_PRESET: WorkflowPreset = {
  id: "youtube-long",
  title: "YouTube Longform",
  subtitle: "Narrative depth + retention pacing + QA loops",
  templateName: "YouTube Longform Pro Workflow",
  description: "Optimized for 8-20 minute videos with strong hook, narrative progression, and consistency checks.",
  guidance: [
    "Start in Content Ruleset: define tone, banned phrases, and factuality policy.",
    "Set Story Brief target duration and must-include beats before writing.",
    "Tune Script Draft max words to your channel pace (typically 1300-2600).",
    "Use Script Approval Gate for human sign-off before media generation.",
    "Keep Quality Gate score at 85+ for longform consistency.",
    "Enable Telegram node in approval_request mode for quick producer decisions.",
  ],
  nodes: [
    node("start", "Triggers.ManualStart", "Start", 30, 220),
    node("profile", "ControlFlow.ProjectProfile", "Channel Profile", 260, 220, {
      channelName: "Your YouTube Channel",
      targetAudience: "Core niche audience",
      contentPillars: "Education, storytelling, analysis",
    }),
    node("brief", "ControlFlow.StoryBrief", "Episode Brief", 500, 220, {
      theme: "Topic to be decided",
      targetDurationSec: 900,
      mustInclude: "Hook, conflict, payoff, CTA",
    }),
    node("rules", "Rulesets.ContentRules", "Content Rules", 740, 120, {
      voiceAndTone: "Authoritative but human, cinematic narration",
      hardConstraints: "No fluff paragraphs, no repeated hooks, no factual claims without support",
      banList: "generic filler, empty hype phrases",
      factPolicy: "strict",
    }),
    node("safety", "Rulesets.BrandSafety", "Brand Safety", 740, 320, {
      platform: "YouTube",
      blockedTopics: "Unsafe claims, policy-violating material",
      sensitiveHandling: "Neutral language and disclaimers where required",
    }),
    node("plan", "Planning.WorkflowPlan", "Workflow Plan", 980, 220, {
      objective: "Publish a high-retention longform episode",
      constraints: "Retention above channel median, clear structure",
      plannerPrompt: "Design a narrative arc with strong chapter transitions.",
    }),
    node("hooks", "Writing.HookAndTitle", "Hook + Title", 1210, 80, {
      variantCount: 8,
      clickStyle: "balanced",
    }),
    node("draft", "ManuscriptWriter.ScriptDraft", "Script Draft", 1210, 230, {
      tone: "cinematic",
      maxWords: 2000,
      writerPrompt: "Write with a 20-second hook and narrative momentum every 45-60 seconds.",
    }),
    node("polish", "Writing.ScriptPolisher", "Script Polish", 1450, 230, {
      aggressiveness: "medium",
      preserveVoice: true,
    }),
    node("approval", "HumanInLoop.ScriptApprovalGate", "Script Approval", 1690, 230, {
      required: true,
      approver: "owner",
    }),
    node("split", "Director.SceneSplitterWithTimestamps", "Scene Split + Timing", 1930, 230, {
      targetSceneCount: 14,
      sceneSplitPrompt: "Prioritize rhythm changes and visual variety every 30-50 seconds.",
    }),
    node("style", "Director.PromptStyler", "Prompt Styler", 2170, 230, {
      stylePreset: "cinematic",
      negativePrompt: "muddy lighting, blurry framing, flat composition",
    }),
    node("images", "Media.ImageBatchGenerator", "Image Batch", 2410, 160, {
      model: "z-image-turbo-replicate",
      aspectRatio: "16:9",
    }),
    node("video", "Media.VideoAssembler", "Video Assembler", 2410, 320, {
      videoModel: "veo-3.1",
      fps: 24,
    }),
    node("qa", "QA.QualityGate", "Quality Gate", 2650, 230, {
      minimumScore: 88,
      rubricPrompt: "Evaluate narrative clarity, retention pacing, visual coherence, and originality.",
    }),
    node("storage", "Storage.SaveRunBundle", "Save Bundle", 2890, 230, {
      saveDocs: true,
      savePrompts: true,
      saveTimelines: true,
    }),
    node("tg", "Notifications.TelegramMessage", "Producer Updates", 3130, 230, {
      mode: "approval_request",
      messageTemplate: "Longform run {{runId}} at {{step}} -> {{status}}. Topic: {{topic}}",
      attachTopArtifacts: true,
    }),
  ],
  edges: [
    edge("start", "run", "profile", "run"),
    edge("profile", "profile", "brief", "profile"),
    edge("brief", "brief", "rules", "brief"),
    edge("brief", "brief", "safety", "brief"),
    edge("brief", "brief", "plan", "brief"),
    edge("rules", "rules", "plan", "rules"),
    edge("plan", "plan", "hooks", "plan"),
    edge("plan", "plan", "draft", "plan"),
    edge("rules", "rules", "draft", "rules"),
    edge("safety", "safety", "draft", "safety"),
    edge("draft", "script", "polish", "script"),
    edge("rules", "rules", "polish", "rules"),
    edge("polish", "scriptOut", "approval", "script"),
    edge("approval", "approvedScript", "split", "script"),
    edge("split", "scenes", "style", "scenes"),
    edge("style", "styledScenes", "images", "scenes"),
    edge("style", "styledScenes", "video", "scenes"),
    edge("images", "images", "video", "images"),
    edge("video", "video", "qa", "draft"),
    edge("qa", "report", "storage", "bundle"),
    edge("storage", "saved", "tg", "payload"),
  ],
}

const YOUTUBE_SHORTS_PRESET: WorkflowPreset = {
  id: "youtube-shorts",
  title: "YouTube Shorts",
  subtitle: "Fast hook + tight pacing + high replay potential",
  templateName: "YouTube Shorts High-Retention Workflow",
  description: "Optimized for 15-60 second vertical content with hook-first writing and dense scene transitions.",
  guidance: [
    "Set Story Brief target to 15-60 seconds and define one sharp payoff.",
    "Use Content Ruleset to enforce concise language and no dead intros.",
    "Keep Script Draft max words tight (60-170 depending on target length).",
    "Raise scene split granularity so each visual beat lands every 1.5-3.5 seconds.",
    "Set Prompt Styler to strong vertical framing and motion clarity.",
    "Use Telegram summary mode for rapid iteration and publish loops.",
  ],
  nodes: [
    node("start", "Triggers.ManualStart", "Start", 30, 220),
    node("profile", "ControlFlow.ProjectProfile", "Shorts Profile", 260, 220, {
      channelName: "Your Shorts Channel",
      targetAudience: "Scroll-speed audience",
      contentPillars: "Hooks, micro-story, payoff",
    }),
    node("brief", "ControlFlow.StoryBrief", "Short Brief", 500, 220, {
      theme: "Single punchy idea",
      targetDurationSec: 35,
      mustInclude: "Hook in first second, surprise, payoff",
    }),
    node("rules", "Rulesets.ContentRules", "Shorts Rules", 740, 220, {
      voiceAndTone: "Punchy, visual, immediate",
      hardConstraints: "No slow intro, no repetitive clauses, one idea per short",
      banList: "long preamble, weak CTA, vague transitions",
      factPolicy: "balanced",
    }),
    node("plan", "Planning.WorkflowPlan", "Micro Plan", 980, 220, {
      objective: "High watch-through short",
      constraints: "First second hook, no filler lines",
      plannerPrompt: "Design beat-by-beat progression for 15-60s.",
    }),
    node("hooks", "Writing.HookAndTitle", "Hook Variants", 1210, 110, {
      variantCount: 10,
      clickStyle: "curiosity",
    }),
    node("draft", "ManuscriptWriter.ScriptDraft", "Short Script", 1210, 260, {
      tone: "playful",
      maxWords: 120,
      writerPrompt: "Write dense, visual lines optimized for replay and retention.",
    }),
    node("split", "Director.SceneSplitterWithTimestamps", "Fast Scene Split", 1450, 260, {
      targetSceneCount: 10,
      sceneSplitPrompt: "Create quick visual beats every 1.5-3.5 seconds.",
    }),
    node("style", "Director.PromptStyler", "Vertical Prompt Style", 1690, 260, {
      stylePreset: "horror",
      negativePrompt: "slow camera, static composition, low contrast",
    }),
    node("images", "Media.ImageBatchGenerator", "Vertical Frames", 1930, 190, {
      model: "z-image-turbo-replicate",
      aspectRatio: "9:16",
    }),
    node("video", "Media.VideoAssembler", "Short Video", 1930, 340, {
      videoModel: "veo-3.1",
      fps: 24,
    }),
    node("qa", "QA.QualityGate", "Retention QA", 2170, 260, {
      minimumScore: 90,
      rubricPrompt: "Score hook strength, pacing density, visual clarity, and replay value.",
    }),
    node("storage", "Storage.SaveRunBundle", "Save Short Bundle", 2410, 260, {
      saveDocs: true,
      savePrompts: true,
      saveTimelines: true,
    }),
    node("tg", "Notifications.TelegramMessage", "Shorts Update", 2650, 260, {
      mode: "summary",
      messageTemplate: "Shorts run {{runId}} status {{status}} at {{step}}.",
      attachTopArtifacts: true,
    }),
  ],
  edges: [
    edge("start", "run", "profile", "run"),
    edge("profile", "profile", "brief", "profile"),
    edge("brief", "brief", "rules", "brief"),
    edge("brief", "brief", "plan", "brief"),
    edge("rules", "rules", "plan", "rules"),
    edge("plan", "plan", "hooks", "plan"),
    edge("plan", "plan", "draft", "plan"),
    edge("rules", "rules", "draft", "rules"),
    edge("draft", "script", "split", "script"),
    edge("split", "scenes", "style", "scenes"),
    edge("style", "styledScenes", "images", "scenes"),
    edge("style", "styledScenes", "video", "scenes"),
    edge("images", "images", "video", "images"),
    edge("video", "video", "qa", "draft"),
    edge("qa", "report", "storage", "bundle"),
    edge("storage", "saved", "tg", "payload"),
  ],
}

export const WORKFLOW_PRESETS: WorkflowPreset[] = [YOUTUBE_LONG_PRESET, YOUTUBE_SHORTS_PRESET]

export function getWorkflowPresetById(presetId: WorkflowPresetId): WorkflowPreset | null {
  return WORKFLOW_PRESETS.find((preset) => preset.id === presetId) || null
}

