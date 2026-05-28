import { NodeTypeDef } from "./types"

export const AUTOPILOT_NODE_TYPES: NodeTypeDef[] = [
  {
    type: "Triggers.ManualStart",
    label: "Manual Start",
    category: "Triggers",
    description: "Starts workflow manually from UI.",
    inputs: [],
    outputs: [{ id: "run", label: "Run", type: "json" }],
    fields: [],
  },
  {
    type: "ControlFlow.ProjectProfile",
    label: "Project Profile",
    category: "ControlFlow",
    description: "Global project metadata and audience profile.",
    inputs: [{ id: "run", label: "Run", type: "json" }],
    outputs: [{ id: "profile", label: "Profile", type: "json" }],
    fields: [
      { key: "channelName", label: "Channel Name", type: "string" },
      { key: "targetAudience", label: "Target Audience", type: "string", ui: { multiline: true } },
      { key: "contentPillars", label: "Content Pillars", type: "string", ui: { multiline: true } },
    ],
  },
  {
    type: "ControlFlow.StoryBrief",
    label: "Story Brief",
    category: "ControlFlow",
    description: "Defines story goal, theme, and constraints for this run.",
    inputs: [{ id: "profile", label: "Profile", type: "json" }],
    outputs: [{ id: "brief", label: "Brief", type: "json" }],
    fields: [
      { key: "theme", label: "Theme", type: "string" },
      { key: "targetDurationSec", label: "Target Duration (sec)", type: "number", default: 600 },
      { key: "mustInclude", label: "Must Include", type: "string", ui: { multiline: true } },
    ],
  },
  {
    type: "Rulesets.ContentRules",
    label: "Content Ruleset",
    category: "ControlFlow",
    description: "Primary quality/rules policy to enforce on writing nodes.",
    inputs: [{ id: "brief", label: "Brief", type: "json" }],
    outputs: [{ id: "rules", label: "Rules", type: "json" }],
    fields: [
      { key: "voiceAndTone", label: "Voice & Tone", type: "string", ui: { multiline: true } },
      { key: "hardConstraints", label: "Hard Constraints", type: "string", ui: { multiline: true } },
      { key: "banList", label: "Ban List", type: "string", ui: { multiline: true } },
      { key: "factPolicy", label: "Fact Policy", type: "string", ui: { options: ["strict", "balanced", "creative"] }, default: "strict" },
    ],
  },
  {
    type: "Rulesets.BrandSafety",
    label: "Brand Safety Ruleset",
    category: "ControlFlow",
    description: "Safety and compliance rules for platform/channel.",
    inputs: [{ id: "brief", label: "Brief", type: "json" }],
    outputs: [{ id: "safety", label: "Safety Rules", type: "json" }],
    fields: [
      { key: "platform", label: "Platform", type: "string", ui: { options: ["YouTube", "TikTok", "Instagram", "General"] }, default: "YouTube" },
      { key: "blockedTopics", label: "Blocked Topics", type: "string", ui: { multiline: true } },
      { key: "sensitiveHandling", label: "Sensitive Topic Handling", type: "string", ui: { multiline: true } },
    ],
  },
  {
    type: "Planning.WorkflowPlan",
    label: "Workflow Plan",
    category: "Planning",
    description: "Creates execution plan and acceptance criteria.",
    inputs: [
      { id: "topic", label: "Topic", type: "string", required: true },
      { id: "brief", label: "Brief", type: "json" },
      { id: "rules", label: "Rules", type: "json" },
    ],
    outputs: [{ id: "plan", label: "Plan", type: "json" }],
    fields: [
      { key: "objective", label: "Objective", type: "string", ui: { multiline: true } },
      { key: "constraints", label: "Constraints", type: "string", ui: { multiline: true } },
      { key: "plannerPrompt", label: "Planner Prompt", type: "string", ui: { multiline: true, placeholder: "Prompt template for plan generation..." } },
    ],
  },
  {
    type: "ManuscriptWriter.ScriptDraft",
    label: "Script Draft",
    category: "Writing",
    description: "Generates script from plan and writing rules.",
    inputs: [
      { id: "plan", label: "Plan", type: "json", required: true },
      { id: "rules", label: "Rules", type: "json", required: true },
      { id: "safety", label: "Safety Rules", type: "json" },
    ],
    outputs: [{ id: "script", label: "Script", type: "scriptDraft" }],
    fields: [
      { key: "tone", label: "Tone", type: "string", default: "cinematic", ui: { options: ["cinematic", "documentary", "educational", "playful"] } },
      { key: "maxWords", label: "Max words", type: "number", default: 1400 },
      { key: "writerPrompt", label: "Writer Prompt", type: "string", ui: { multiline: true, placeholder: "How should this node write the script?" } },
    ],
  },
  {
    type: "Writing.HookAndTitle",
    label: "Hook + Title Generator",
    category: "Writing",
    description: "Generates title options and opening hooks.",
    inputs: [
      { id: "plan", label: "Plan", type: "json", required: true },
      { id: "rules", label: "Rules", type: "json" },
    ],
    outputs: [{ id: "hooks", label: "Hooks", type: "json" }],
    fields: [
      { key: "variantCount", label: "Variants", type: "number", default: 5 },
      { key: "clickStyle", label: "Click Style", type: "string", ui: { options: ["curiosity", "authority", "emotional", "balanced"] }, default: "balanced" },
    ],
  },
  {
    type: "Writing.ScriptPolisher",
    label: "Script Polisher",
    category: "Writing",
    description: "Refines script pacing, clarity, and consistency.",
    inputs: [
      { id: "script", label: "Script", type: "scriptDraft", required: true },
      { id: "rules", label: "Rules", type: "json" },
    ],
    outputs: [{ id: "scriptOut", label: "Polished Script", type: "scriptDraft" }],
    fields: [
      { key: "aggressiveness", label: "Polish Level", type: "string", ui: { options: ["light", "medium", "strong"] }, default: "medium" },
      { key: "preserveVoice", label: "Preserve Voice", type: "boolean", default: true },
    ],
  },
  {
    type: "Director.SceneSplitterWithTimestamps",
    label: "Scene Splitter + Timestamps",
    category: "Directing",
    description: "Splits script into timed scenes with metadata.",
    inputs: [{ id: "script", label: "Script", type: "scriptDraft", required: true }],
    outputs: [{ id: "scenes", label: "Scenes", type: "json" }],
    fields: [
      { key: "targetSceneCount", label: "Target scene count", type: "number", default: 8 },
      { key: "sceneSplitPrompt", label: "Scene Split Prompt", type: "string", ui: { multiline: true, placeholder: "Instructions for splitting scenes and timestamps..." } },
    ],
  },
  {
    type: "Director.PromptStyler",
    label: "Prompt Styler",
    category: "Directing",
    description: "Applies visual style rules to all scene prompts.",
    inputs: [{ id: "scenes", label: "Scenes", type: "json", required: true }],
    outputs: [{ id: "styledScenes", label: "Styled Scenes", type: "json" }],
    fields: [
      { key: "stylePreset", label: "Style Preset", type: "string", default: "cinematic", ui: { options: ["cinematic", "horror", "anime", "realistic", "documentary"] } },
      { key: "negativePrompt", label: "Negative Prompt", type: "string", ui: { multiline: true } },
    ],
  },
  {
    type: "Media.ImageBatchGenerator",
    label: "Image Batch Generator",
    category: "Media",
    description: "Creates images from scene prompts.",
    inputs: [{ id: "scenes", label: "Styled Scenes", type: "json", required: true }],
    outputs: [{ id: "images", label: "Images", type: "fileRef[]" }],
    fields: [
      { key: "model", label: "Image Model", type: "string", ui: { options: ["z-image-turbo-replicate", "gpt-image-1", "flux"] }, default: "z-image-turbo-replicate" },
      { key: "aspectRatio", label: "Aspect Ratio", type: "string", default: "16:9", ui: { options: ["16:9", "9:16", "1:1"] } },
    ],
  },
  {
    type: "Media.VideoAssembler",
    label: "Video Assembler",
    category: "Media",
    description: "Builds final video timeline from scenes and imagery.",
    inputs: [
      { id: "scenes", label: "Scenes", type: "json", required: true },
      { id: "images", label: "Images", type: "fileRef[]" },
    ],
    outputs: [{ id: "video", label: "Video", type: "fileRef" }],
    fields: [
      { key: "videoModel", label: "Video Model", type: "string", ui: { options: ["veo-3.1", "runway", "stability"] }, default: "veo-3.1" },
      { key: "fps", label: "FPS", type: "number", default: 24 },
    ],
  },
  {
    type: "QA.QualityGate",
    label: "Quality Gate",
    category: "QA",
    description: "Scores output against acceptance criteria.",
    inputs: [{ id: "draft", label: "Draft", type: "json", required: true }],
    outputs: [{ id: "report", label: "QA report", type: "qaReport" }],
    fields: [
      { key: "minimumScore", label: "Minimum score", type: "number", default: 80 },
      { key: "rubricPrompt", label: "Rubric Prompt", type: "string", ui: { multiline: true, placeholder: "Quality rubric and acceptance checks..." } },
    ],
  },
  {
    type: "HumanInLoop.ScriptApprovalGate",
    label: "Script Approval Gate",
    category: "HumanInLoop",
    description: "Requires approval before continuing media generation.",
    inputs: [{ id: "script", label: "Script", type: "scriptDraft", required: true }],
    outputs: [{ id: "approvedScript", label: "Approved Script", type: "scriptDraft" }],
    fields: [
      { key: "required", label: "Approval Required", type: "boolean", default: true },
      { key: "approver", label: "Approver", type: "string", default: "owner" },
    ],
  },
  {
    type: "Storage.SaveRunBundle",
    label: "Save Run Bundle",
    category: "Storage",
    description: "Stores script, prompts, timelines and QA outputs into subproject folders.",
    inputs: [{ id: "bundle", label: "Bundle", type: "json", required: true }],
    outputs: [{ id: "saved", label: "Saved", type: "json" }],
    fields: [
      { key: "saveDocs", label: "Save Docs", type: "boolean", default: true },
      { key: "savePrompts", label: "Save Prompts", type: "boolean", default: true },
      { key: "saveTimelines", label: "Save Timelines", type: "boolean", default: true },
    ],
  },
  {
    type: "Notifications.TelegramMessage",
    label: "Telegram Message",
    category: "Notifications",
    description: "Sends run updates, drafts, or approval requests to Telegram.",
    inputs: [{ id: "payload", label: "Payload", type: "json", required: true }],
    outputs: [{ id: "sent", label: "Sent", type: "json" }],
    fields: [
      { key: "chatId", label: "Chat ID", type: "string", ui: { placeholder: "e.g. 123456789" } },
      {
        key: "mode",
        label: "Send Mode",
        type: "string",
        default: "summary",
        ui: { options: ["summary", "script", "artifacts", "approval_request"] },
      },
      { key: "messageTemplate", label: "Message Template", type: "string", ui: { multiline: true, placeholder: "Template with variables, e.g. {{topic}} {{runId}}" } },
      { key: "attachTopArtifacts", label: "Attach Top Artifacts", type: "boolean", default: true },
    ],
  },
]

export const AUTOPILOT_NODE_HIERARCHY: string[] = [
  "Triggers.ManualStart",
  "ControlFlow.ProjectProfile",
  "ControlFlow.StoryBrief",
  "Rulesets.ContentRules",
  "Rulesets.BrandSafety",
  "Planning.WorkflowPlan",
  "Writing.HookAndTitle",
  "ManuscriptWriter.ScriptDraft",
  "Writing.ScriptPolisher",
  "HumanInLoop.ScriptApprovalGate",
  "Director.SceneSplitterWithTimestamps",
  "Director.PromptStyler",
  "Media.ImageBatchGenerator",
  "Media.VideoAssembler",
  "QA.QualityGate",
  "Storage.SaveRunBundle",
  "Notifications.TelegramMessage",
]

export const AUTOPILOT_NODE_TYPES_BY_TYPE = AUTOPILOT_NODE_TYPES.reduce<Record<string, NodeTypeDef>>(
  (acc, def) => {
    acc[def.type] = def
    return acc
  },
  {}
)
