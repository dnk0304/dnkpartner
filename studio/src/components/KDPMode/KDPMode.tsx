import { useState, useCallback, useEffect } from "react"
import { ChevronLeft, Save, FolderOpen, Plus, Trash2, Download, BookOpen, Sparkles } from "lucide-react"
import { Button } from "../Button"
import { Card, CardContent, CardHeader, CardTitle } from "../Card"
import { cn } from "@/lib/utils"
import {
  KDPProject,
  WizardStep,
  WIZARD_STEPS,
  createEmptyProject,
  validateProject,
  generateKDPId,
  createEmptyPage,
  KDPPage,
  KDPImage,
} from "@/types/KDPMode"
import type { GeneratedImage } from "./KDPAIBotWizard"
import { KDPWizardSteps } from "./KDPWizardSteps"
import { KDPBookSetupStep } from "./steps/KDPBookSetupStep"
import { KDPInteriorStep } from "./steps/KDPInteriorStep"
import { KDPCoverStep } from "./steps/KDPCoverStep"
import { KDPExportStep } from "./steps/KDPExportStep"
import { KDPPreviewStep } from "./steps/KDPPreviewStep"
import { KDPProjectManager } from "./KDPProjectManager"
import { KDPAIBotWizard } from "./KDPAIBotWizard"

interface KDPModeProps {
  onBack: () => void
}

export function KDPMode({ onBack }: KDPModeProps) {
  const [project, setProject] = useState<KDPProject>(createEmptyProject())
  const [currentStep, setCurrentStep] = useState<WizardStep>("book-setup")
  const [savedProjects, setSavedProjects] = useState<KDPProject[]>([])
  const [isProjectManagerOpen, setIsProjectManagerOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isAIBotOpen, setIsAIBotOpen] = useState(true) // Auto-open on entry
  const [transferredImageCount, setTransferredImageCount] = useState<number>(0)

  // Load saved projects from server
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const response = await fetch("/api/kdp/projects")
        if (!response.ok) throw new Error("Failed to fetch projects")
        const data = await response.json()
        setSavedProjects(data.projects || [])
        
        // Migration: Check localStorage for old projects
        const localStorageProjects = localStorage.getItem("kdp_projects")
        if (localStorageProjects) {
          try {
            const oldProjects = JSON.parse(localStorageProjects)
            if (Array.isArray(oldProjects) && oldProjects.length > 0) {
              console.log(`[KDP] Found ${oldProjects.length} projects in localStorage, migrating...`)
              // Migrate each project
              for (const proj of oldProjects) {
                try {
                  await fetch("/api/kdp/projects/save", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ project: proj }),
                  })
                } catch (e) {
                  console.error(`[KDP] Failed to migrate project ${proj.id}:`, e)
                }
              }
              // Clear localStorage after migration
              localStorage.removeItem("kdp_projects")
              console.log("[KDP] Migration complete, localStorage cleared")
              // Reload projects
              const reloadResponse = await fetch("/api/kdp/projects")
              const reloadData = await reloadResponse.json()
              setSavedProjects(reloadData.projects || [])
            }
          } catch (e) {
            console.error("[KDP] Migration error:", e)
          }
        }
      } catch (error) {
        console.error("[KDP] Failed to load projects:", error)
        // Fallback to localStorage if server fails
        const saved = localStorage.getItem("kdp_projects")
        if (saved) {
          try {
            setSavedProjects(JSON.parse(saved))
          } catch (e) {
            console.error("Failed to parse localStorage projects:", e)
          }
        }
      }
    }
    loadProjects()
  }, [])

  // Save projects is now server-side, no need for localStorage helper
  // Removed: saveProjectsToStorage

  // Update project
  const updateProject = useCallback((updates: Partial<KDPProject>) => {
    setProject(prev => ({
      ...prev,
      ...updates,
      updatedAt: Date.now(),
    }))
  }, [])

  // Handle dynamic updates when trim size changes
  useEffect(() => {
    if (!project.trimSize) return

    // Recalculate cover dimensions when trim size changes
    // The cover step will use calculateCoverDimensions() which already handles this
    // No action needed here - just ensure state propagates
  }, [project.trimSize, project.pageCount, project.paperType])

  // Save current project to server
  const handleSaveProject = useCallback(async () => {
    setIsSaving(true)
    setSaveError(null)
    
    try {
      // Generate thumbnail from first page or cover
      let thumbnail = project.thumbnail
      if (!thumbnail && project.cover.frontImage?.src) {
        thumbnail = project.cover.frontImage.src
      } else if (!thumbnail && project.pages[0]?.images[0]?.src) {
        thumbnail = project.pages[0].images[0].src
      }
      
      const updatedProject = { 
        ...project, 
        updatedAt: Date.now(),
        thumbnail,
      }
      
      // Save to server
      const response = await fetch("/api/kdp/projects/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: updatedProject }),
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(errorData.error || "Failed to save project")
      }
      
      // Update local state
      setProject(updatedProject)
      
      // Reload project list
      const listResponse = await fetch("/api/kdp/projects")
      const listData = await listResponse.json()
      setSavedProjects(listData.projects || [])
      
      console.log("[KDP] Project saved successfully")
    } catch (error: any) {
      console.error("[KDP] Save error:", error)
      // Check if it's a network error (server not running)
      if (error.message === "Failed to fetch" || error.name === "TypeError") {
        setSaveError("Cannot connect to server. Make sure the backend is running (npm run server)")
      } else {
        setSaveError(error.message || "Failed to save project")
      }
    } finally {
      setIsSaving(false)
    }
  }, [project])

  // Load project from server
  const handleLoadProject = useCallback(async (projectId: string) => {
    try {
      const response = await fetch(`/api/kdp/projects/${projectId}`)
      if (!response.ok) throw new Error("Failed to load project")
      
      const data = await response.json()
      setProject(data.project)
      setCurrentStep("book-setup")
      setIsProjectManagerOpen(false)
      console.log("[KDP] Project loaded successfully")
    } catch (error) {
      console.error("[KDP] Load error:", error)
      alert("Failed to load project")
    }
  }, [])

  // Delete project from server
  const handleDeleteProject = useCallback(async (projectId: string) => {
    try {
      console.log(`[KDP] Attempting to delete project: ${projectId}`)
      
      const response = await fetch(`/api/kdp/projects/${projectId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      })
      
      console.log(`[KDP] Delete response status: ${response.status}`)
      
      let result
      try {
        result = await response.json()
      } catch (jsonError) {
        console.error("[KDP] Failed to parse response as JSON:", jsonError)
        throw new Error(`Server returned invalid response (${response.status})`)
      }
      
      if (!response.ok) {
        console.error("[KDP] Delete failed:", result)
        throw new Error(result.error || `Failed to delete project (${response.status})`)
      }
      
      console.log("[KDP] Delete successful:", result)
      
      // Update local state
      const newProjects = savedProjects.filter(p => p.id !== projectId)
      setSavedProjects(newProjects)
      
      if (project.id === projectId) {
        setProject(createEmptyProject())
      }
      
      console.log("[KDP] Project deleted successfully from local state")
    } catch (error) {
      console.error("[KDP] Delete error:", error)
      const errorMessage = error instanceof Error ? error.message : "Failed to delete project"
      alert(`Error deleting project: ${errorMessage}\n\nPlease check the browser console and server logs for more details.`)
    }
  }, [project.id, savedProjects])

  // Create new project
  const handleNewProject = useCallback(() => {
    setProject(createEmptyProject())
    setCurrentStep("book-setup")
    setIsProjectManagerOpen(false)
  }, [])

  // Handle AI Bot Wizard completion - sync generated content to project
  const handleAIBotComplete = useCallback((wizardResult: Partial<KDPProject>) => {
    // The new wizard provides:
    // - bookType, trimSize, pageCount
    // - metadata (title, author)
    // - generatedPrompts[] (custom property with AI-generated prompts)
    // - imageryStyle (custom property with selected style)
    // - generatedImages[] (custom property with generated images from wizard)
    // - coverImageUrl, coverTextElements (optional cover data)
    
    // Extract custom properties
    const generatedPrompts = (wizardResult as any).generatedPrompts as string[] | undefined
    const imageryStyle = (wizardResult as any).imageryStyle
    const generatedImages = (wizardResult as any).generatedImages as GeneratedImage[] | undefined
    const coverImageUrl = (wizardResult as any).coverImageUrl as string | undefined
    const coverTextElements = (wizardResult as any).coverTextElements
    
    // Convert generated images to KDPPages with KDPImages
    const pages: KDPPage[] = []
    let completedImageCount = 0
    
    if (generatedImages && generatedImages.length > 0) {
      generatedImages.forEach((genImg, index) => {
        if (genImg.status === "complete" && genImg.imageUrl) {
          completedImageCount++
          // Create a KDPImage from the generated image
          const kdpImage: KDPImage = {
            id: generateKDPId("img"),
            src: genImg.imageUrl,
            fileName: `ai-generated-${index + 1}.png`,
            originalWidth: 1024, // Default AI image size
            originalHeight: 1024,
            position: { x: 0, y: 0 }, // Centered by default
            scale: 1,
            rotation: 0,
          }
          
          // Create a page with this image
          const page: KDPPage = {
            id: generateKDPId("page"),
            pageNumber: index + 1,
            images: [kdpImage],
            elements: [],
            backgroundColor: "#ffffff",
          }
          
          pages.push(page)
        } else {
          // Create empty page for pending/error images
          pages.push(createEmptyPage(index + 1))
        }
      })
    } else if (wizardResult.pageCount) {
      // Fallback: create empty pages if no generated images
      for (let i = 0; i < wizardResult.pageCount; i++) {
        pages.push(createEmptyPage(i + 1))
      }
    }
    
    setProject(prev => {
      const updatedProject: KDPProject = {
        ...prev,
        bookType: wizardResult.bookType || prev.bookType,
        trimSize: wizardResult.trimSize || prev.trimSize,
        pageCount: pages.length || wizardResult.pageCount || prev.pageCount,
        metadata: {
          ...prev.metadata,
          ...wizardResult.metadata,
        },
        pages,
        name: wizardResult.name || wizardResult.metadata?.title || prev.name,
        updatedAt: Date.now(),
      }
      
      // Store generated prompts and style in a custom field for reference
      ;(updatedProject as any).aiWizardPrompts = generatedPrompts
      ;(updatedProject as any).aiWizardStyle = imageryStyle
      
      // Auto-save cover if generated
      if (coverImageUrl) {
        updatedProject.cover = {
          ...updatedProject.cover,
          frontImage: {
            id: generateKDPId("img"),
            src: coverImageUrl,
            fileName: "ai-cover.png",
            originalWidth: 1024,
            originalHeight: 1536,
            position: { x: 0, y: 0 },
            scale: 1,
            rotation: 0,
          },
        }
        // Store text elements for the cover step to use
        ;(updatedProject as any).coverTextElements = coverTextElements
      }
      
      return updatedProject
    })
    
    // Set transferred image count for visual feedback
    setTransferredImageCount(completedImageCount)
    
    // Close the wizard and go to interior step to view/edit generated images
    setIsAIBotOpen(false)
    setCurrentStep("interior")
  }, [])

  // Navigate steps
  const goToStep = useCallback((step: WizardStep) => {
    setCurrentStep(step)
  }, [])

  const goToNextStep = useCallback(() => {
    const currentIndex = WIZARD_STEPS.findIndex(s => s.id === currentStep)
    if (currentIndex < WIZARD_STEPS.length - 1) {
      setCurrentStep(WIZARD_STEPS[currentIndex + 1].id)
    }
  }, [currentStep])

  const goToPreviousStep = useCallback(() => {
    const currentIndex = WIZARD_STEPS.findIndex(s => s.id === currentStep)
    if (currentIndex > 0) {
      setCurrentStep(WIZARD_STEPS[currentIndex - 1].id)
    }
  }, [currentStep])

  // Get step completion status
  const getStepStatus = useCallback((stepId: WizardStep): "completed" | "current" | "upcoming" => {
    const stepIndex = WIZARD_STEPS.findIndex(s => s.id === stepId)
    const currentIndex = WIZARD_STEPS.findIndex(s => s.id === currentStep)
    
    if (stepIndex < currentIndex) return "completed"
    if (stepIndex === currentIndex) return "current"
    return "upcoming"
  }, [currentStep])

  // Check if a step has minimum required data
  const canAccessStep = useCallback((stepId: WizardStep): boolean => {
    // Always allow access to book-setup
    if (stepId === "book-setup") return true
    
    // For other steps, check if basic setup is done
    const hasBasicSetup = project.bookType && project.interiorType && project.trimSize
    if (!hasBasicSetup) return false
    
    // All steps accessible if basic setup is complete
    return true
  }, [project.bookType, project.interiorType, project.trimSize])

  // Validate project
  const validation = validateProject(project)

  // Render current step content
  const renderStepContent = () => {
    switch (currentStep) {
      case "book-setup":
        return (
          <KDPBookSetupStep
            project={project}
            onUpdate={updateProject}
            onNext={goToNextStep}
          />
        )
      case "interior":
        return (
          <KDPInteriorStep
            project={project}
            onUpdate={updateProject}
            onNext={goToNextStep}
            onBack={goToPreviousStep}
            transferredImageCount={transferredImageCount}
            onClearTransferFeedback={() => setTransferredImageCount(0)}
          />
        )
      case "cover":
        return (
          <KDPCoverStep
            project={project}
            onUpdate={updateProject}
            onNext={goToNextStep}
            onBack={goToPreviousStep}
          />
        )
      case "export":
        return (
          <KDPExportStep
            project={project}
            onUpdate={updateProject}
            onNext={goToNextStep}
            onBack={goToPreviousStep}
          />
        )
      case "preview":
        return (
          <KDPPreviewStep
            project={project}
            onUpdate={updateProject}
            onBack={goToPreviousStep}
            validation={validation}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[var(--color-background)]/95 backdrop-blur-sm border-b border-[var(--color-border)]">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={onBack}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-[var(--color-text)] flex items-center gap-2">
                  <BookOpen className="w-7 h-7 text-[var(--color-primary)]" />
                  KDP Mode
                </h1>
                <p className="text-sm text-[var(--color-text-dim)]">
                  Create print-ready books for Amazon KDP
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Project Name */}
              <input
                type="text"
                value={project.name}
                onChange={(e) => updateProject({ name: e.target.value })}
                className="px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] w-48"
                placeholder="Project name..."
              />
              
              {/* Action Buttons */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAIBotOpen(true)}
                className="border-purple-500/50 hover:bg-purple-500/10 group"
              >
                <Sparkles className="w-4 h-4 mr-2 text-purple-400 group-hover:text-purple-300" />
                <span className="ai-wizard-text font-semibold">AI Wizard</span>
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsProjectManagerOpen(true)}
              >
                <FolderOpen className="w-4 h-4 mr-2" />
                Projects
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleNewProject}
              >
                <Plus className="w-4 h-4 mr-2" />
                New
              </Button>
              
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveProject}
                disabled={isSaving}
              >
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? "Saving..." : "Save"}
              </Button>
              
              {/* Save Error Display */}
              {saveError && (
                <div className="ml-3 text-xs text-red-400 max-w-xs">
                  {saveError}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={cn(
        "mx-auto py-6",
        currentStep === "cover" ? "px-4 max-w-[1600px]" : "px-6 max-w-7xl"
      )}>
        {/* Wizard Steps Progress */}
        <KDPWizardSteps
          currentStep={currentStep}
          onStepClick={goToStep}
          getStepStatus={getStepStatus}
          canAccessStep={canAccessStep}
        />

        {/* Step Content */}
        <div className="mt-8">
          {renderStepContent()}
        </div>

        {/* Validation Warnings */}
        {validation.warnings.length > 0 && currentStep === "preview" && (
          <Card className="mt-6 border-yellow-500/30 bg-yellow-500/5">
            <CardContent className="py-4">
              <h4 className="text-sm font-medium text-yellow-500 mb-2">⚠️ Warnings</h4>
              <ul className="text-sm text-[var(--color-text-muted)] space-y-1">
                {validation.warnings.map((warning, i) => (
                  <li key={i}>• {warning}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Validation Errors */}
        {validation.errors.length > 0 && currentStep === "preview" && (
          <Card className="mt-4 border-red-500/30 bg-red-500/5">
            <CardContent className="py-4">
              <h4 className="text-sm font-medium text-red-500 mb-2">❌ Errors</h4>
              <ul className="text-sm text-[var(--color-text-muted)] space-y-1">
                {validation.errors.map((error, i) => (
                  <li key={i}>• {error}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Project Manager Modal */}
      {isProjectManagerOpen && (
        <KDPProjectManager
          projects={savedProjects}
          currentProjectId={project.id}
          onClose={() => setIsProjectManagerOpen(false)}
          onLoad={handleLoadProject}
          onDelete={handleDeleteProject}
          onNew={handleNewProject}
        />
      )}

      {/* AI Bot Wizard Modal */}
      <KDPAIBotWizard
        isOpen={isAIBotOpen}
        onClose={() => setIsAIBotOpen(false)}
        onComplete={handleAIBotComplete}
        initialProject={project}
      />
    </div>
  )
}

