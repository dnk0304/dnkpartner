// ============================================================
// DNK AI Studio - Story Base Manager
// ============================================================

import { useState, useEffect } from "react"
import { X, Plus, Edit2, Trash2, Save, Layers, Users, Box, MapPin, Cloud, Palette, Check, Sparkles } from "lucide-react"
import { Button } from "./Button"
import { Card, CardContent, CardHeader, CardTitle } from "./Card"
import { cn } from "@/lib/utils"
import { ImageryStyle, IMAGERY_STYLE_PRESETS } from "@/types/StudioMode"

interface StoryCharacter {
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt?: number
}

interface StoryObject {
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt?: number
}

interface StoryEnvironment {
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt?: number
}

interface StoryAtmosphere {
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt?: number
}

interface StoryBase {
  id: string
  name: string
  description?: string
  characters: StoryCharacter[]
  objects: StoryObject[]
  environments: StoryEnvironment[]
  atmospheres: StoryAtmosphere[]
  imageryStyleId: string | null
  createdAt: number
  updatedAt: number
  lastUsed?: number
}

interface StoryBaseSummary {
  id: string
  name: string
  description?: string
  characterCount: number
  objectCount: number
  environmentCount: number
  atmosphereCount: number
  imageryStyleId: string | null
  createdAt: number
  updatedAt: number
  lastUsed?: number
}

interface StoryBaseManagerProps {
  onClose: () => void
  onSelectStoryBase?: (storyBase: StoryBase) => void
  activeStoryBaseId?: string | null
}

type ElementType = "characters" | "objects" | "environments" | "atmospheres" | "style"

export function StoryBaseManager({ onClose, onSelectStoryBase, activeStoryBaseId }: StoryBaseManagerProps) {
  const [storyBases, setStoryBases] = useState<StoryBaseSummary[]>([])
  const [selectedStoryBaseId, setSelectedStoryBaseId] = useState<string | null>(activeStoryBaseId || null)
  const [currentStoryBase, setCurrentStoryBase] = useState<StoryBase | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [activeTab, setActiveTab] = useState<ElementType>("characters")
  const [editingElement, setEditingElement] = useState<{ type: ElementType; id: string | null }>({ type: "characters", id: null })
  const [elementName, setElementName] = useState("")
  const [elementDescription, setElementDescription] = useState("")
  const [availableStyles, setAvailableStyles] = useState<ImageryStyle[]>([])
  const [isSelectingStyle, setIsSelectingStyle] = useState(false)

  // Load story bases list and available styles
  useEffect(() => {
    loadStoryBases()
    loadAvailableStyles()
  }, [])

  // Load available imagery styles
  const loadAvailableStyles = async () => {
    try {
      // Load both preset and custom styles
      const presetsResponse = await fetch("/api/styles/previews")
      const customsResponse = await fetch("/api/styles/custom")
      
      if (presetsResponse.ok && customsResponse.ok) {
        const previewUrls = await presetsResponse.json()
        const customs = await customsResponse.json()
        
        // Convert preview URLs to ImageryStyle objects
        const presets: ImageryStyle[] = Object.keys(previewUrls).map((id) => {
          // Match with IMAGERY_STYLE_PRESETS from StudioMode.ts
          const presetData = IMAGERY_STYLE_PRESETS.find((p: any) => p.id === id)
          return {
            id,
            name: presetData?.name || id,
            description: presetData?.description || "",
            prompt: presetData?.prompt || "",
            isCustom: false,
            createdAt: Date.now(),
          }
        })
        
        setAvailableStyles([...presets, ...customs])
      }
    } catch (error) {
      console.error("Failed to load imagery styles:", error)
    }
  }

  // Load selected story base details
  useEffect(() => {
    if (selectedStoryBaseId) {
      loadStoryBaseDetails(selectedStoryBaseId)
    } else {
      setCurrentStoryBase(null)
    }
  }, [selectedStoryBaseId])

  const loadStoryBases = async () => {
    try {
      const response = await fetch("/api/story-bases")
      if (response.ok) {
        const data = await response.json()
        setStoryBases(data)
      }
    } catch (error) {
      console.error("Failed to load story bases:", error)
    }
  }

  const loadStoryBaseDetails = async (id: string) => {
    try {
      const response = await fetch(`/api/story-bases/${id}`)
      if (response.ok) {
        const data = await response.json()
        setCurrentStoryBase(data)
      }
    } catch (error) {
      console.error("Failed to load story base details:", error)
    }
  }

  const handleCreateStoryBase = async () => {
    if (!newName.trim()) {
      alert("Please enter a name")
      return
    }

    try {
      const response = await fetch("/api/story-bases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          description: newDescription,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to create story base")
      }

      const newStoryBase = await response.json()
      setNewName("")
      setNewDescription("")
      setIsCreating(false)
      await loadStoryBases()
      setSelectedStoryBaseId(newStoryBase.id)
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to create story base")
    }
  }

  const handleDeleteStoryBase = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return

    try {
      const response = await fetch(`/api/story-bases/${id}`, {
        method: "DELETE",
      })

      if (!response.ok) throw new Error("Failed to delete story base")

      if (selectedStoryBaseId === id) {
        setSelectedStoryBaseId(null)
      }
      await loadStoryBases()
    } catch (error) {
      alert("Failed to delete story base")
    }
  }

  const handleAddElement = () => {
    setEditingElement({ type: activeTab, id: null })
    setElementName("")
    setElementDescription("")
  }

  const handleEditElement = (type: ElementType, element: any) => {
    setEditingElement({ type, id: element.id })
    setElementName(element.name)
    setElementDescription(element.description)
  }

  const handleSaveElement = async () => {
    if (!currentStoryBase || !elementName.trim() || !elementDescription.trim()) {
      alert("Please fill in all fields")
      return
    }

    const newElement = editingElement.id
      ? null
      : {
          id: `${editingElement.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: elementName,
          description: elementDescription,
          createdAt: Date.now(),
        }

    const updatedElements = editingElement.id
      ? currentStoryBase[editingElement.type].map((el: any) =>
          el.id === editingElement.id
            ? { ...el, name: elementName, description: elementDescription, updatedAt: Date.now() }
            : el
        )
      : [...currentStoryBase[editingElement.type], newElement]

    try {
      const response = await fetch(`/api/story-bases/${currentStoryBase.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [editingElement.type]: updatedElements,
        }),
      })

      if (!response.ok) throw new Error("Failed to save element")

      const updated = await response.json()
      setCurrentStoryBase(updated)
      setEditingElement({ type: activeTab, id: null })
      setElementName("")
      setElementDescription("")
      await loadStoryBases()
    } catch (error) {
      alert("Failed to save element")
    }
  }

  const handleDeleteElement = async (type: ElementType, id: string) => {
    if (!currentStoryBase || !confirm("Are you sure you want to delete this element?")) return

    const updatedElements = currentStoryBase[type].filter((el: any) => el.id !== id)

    try {
      const response = await fetch(`/api/story-bases/${currentStoryBase.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [type]: updatedElements,
        }),
      })

      if (!response.ok) throw new Error("Failed to delete element")

      const updated = await response.json()
      setCurrentStoryBase(updated)
      await loadStoryBases()
    } catch (error) {
      alert("Failed to delete element")
    }
  }

  const handleSelectStoryBase = () => {
    if (currentStoryBase && onSelectStoryBase) {
      // Convert imageryStyleId to full imageryStyle object for App.tsx
      const resolvedStyle = currentStoryBase.imageryStyleId 
        ? availableStyles.find(s => s.id === currentStoryBase.imageryStyleId) || null
        : null
      
      // Create a compatible StoryBase object with imageryStyle instead of imageryStyleId
      const storyBaseWithStyle = {
        ...currentStoryBase,
        imageryStyle: resolvedStyle,
      }
      
      onSelectStoryBase(storyBaseWithStyle as any)
      onClose()
    }
  }

  const getElementIcon = (type: ElementType) => {
    switch (type) {
      case "characters":
        return <Users className="w-4 h-4" />
      case "objects":
        return <Box className="w-4 h-4" />
      case "environments":
        return <MapPin className="w-4 h-4" />
      case "atmospheres":
        return <Cloud className="w-4 h-4" />
      case "style":
        return <Palette className="w-4 h-4" />
    }
  }

  const getElementLabel = (type: ElementType) => {
    if (type === "style") return "Imagery Style"
    return type.charAt(0).toUpperCase() + type.slice(1)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-7xl h-[90vh] bg-[var(--color-surface)] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-[var(--color-border)] bg-gradient-to-r from-orange-500/10 to-red-500/10">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-[var(--color-text)] flex items-center gap-2">
                <Layers className="w-6 h-6 text-orange-400" />
                Story Base Manager
              </h2>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                Create and manage story bases with characters, objects, environments, and atmospheres
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left Sidebar - Story Base List */}
          <div className="w-80 border-r border-[var(--color-border)] flex flex-col">
            <div className="p-4 border-b border-[var(--color-border)]">
              {isCreating ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Story Base Name"
                    className="w-full px-3 py-2 text-sm bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <input
                    type="text"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full px-3 py-2 text-sm bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleCreateStoryBase} className="flex-1">
                      <Save className="w-3 h-3 mr-1" />
                      Create
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsCreating(false)
                        setNewName("")
                        setNewDescription("")
                      }}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" onClick={() => setIsCreating(true)} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  New Story Base
                </Button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {storyBases.length === 0 ? (
                <p className="text-sm text-[var(--color-text-dim)] text-center py-8">
                  No story bases yet. Create one to get started!
                </p>
              ) : (
                storyBases.map((sb) => (
                  <div
                    key={sb.id}
                    className={cn(
                      "p-3 rounded-lg cursor-pointer transition-colors",
                      selectedStoryBaseId === sb.id
                        ? "bg-orange-500/20 border-2 border-orange-500"
                        : "bg-[var(--color-background)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"
                    )}
                    onClick={() => setSelectedStoryBaseId(sb.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-[var(--color-text)] truncate">
                          {sb.name}
                        </h3>
                        {sb.description && (
                          <p className="text-xs text-[var(--color-text-muted)] truncate mt-0.5">
                            {sb.description}
                          </p>
                        )}
                        <div className="flex gap-2 mt-2 text-xs text-[var(--color-text-dim)]">
                          <span>{sb.characterCount} char</span>
                          <span>{sb.objectCount} obj</span>
                          <span>{sb.environmentCount} env</span>
                          <span>{sb.atmosphereCount} atm</span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteStoryBase(sb.id, sb.name)
                        }}
                        className="h-6 w-6 text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Side - Story Base Details */}
          <div className="flex-1 flex flex-col">
            {currentStoryBase ? (
              <>
                {/* Tabs */}
                <div className="flex border-b border-[var(--color-border)] bg-[var(--color-background)]">
                  {(["characters", "objects", "environments", "atmospheres", "style"] as ElementType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => setActiveTab(type)}
                      className={cn(
                        "flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors",
                        activeTab === type
                          ? "text-orange-500 border-b-2 border-orange-500 bg-orange-500/5"
                          : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                      )}
                    >
                      {getElementIcon(type)}
                      {getElementLabel(type)} {type !== "style" && `(${currentStoryBase[type].length})`}
                    </button>
                  ))}
                </div>

                {/* Element List & Editor */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {/* Style Tab Content */}
                  {activeTab === "style" ? (
                    <div className="space-y-4">
                      <div className="text-center">
                        <Palette className="w-12 h-12 mx-auto mb-3 text-orange-400" />
                        <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">
                          Imagery Style for Story Base
                        </h3>
                        <p className="text-sm text-[var(--color-text-muted)] max-w-md mx-auto">
                          Choose an imagery style that will be applied to all generations using this Story Base
                        </p>
                      </div>

                      {/* Current Style */}
                      {currentStoryBase.imageryStyleId ? (
                        <Card className="border-2 border-orange-500">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-semibold text-[var(--color-text)]">
                                  Selected Style: {availableStyles.find(s => s.id === currentStoryBase.imageryStyleId)?.name || currentStoryBase.imageryStyleId}
                                </p>
                                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                                  {availableStyles.find(s => s.id === currentStoryBase.imageryStyleId)?.description || ""}
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setIsSelectingStyle(true)}
                              >
                                Change
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ) : (
                        <div
                          className="p-8 border-2 border-dashed border-[var(--color-border)] rounded-lg cursor-pointer hover:border-orange-500 transition-colors text-center"
                          onClick={() => setIsSelectingStyle(true)}
                        >
                          <Sparkles className="w-8 h-8 mx-auto mb-2 text-[var(--color-text-dim)]" />
                          <p className="text-sm text-[var(--color-text-muted)]">
                            Click to select an imagery style
                          </p>
                        </div>
                      )}

                      {/* Style Selection Modal */}
                      {isSelectingStyle && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                          <div className="w-full max-w-2xl max-h-[80vh] bg-[var(--color-surface)] rounded-xl shadow-2xl overflow-hidden">
                            <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
                              <h3 className="text-lg font-semibold text-[var(--color-text)]">Select Imagery Style</h3>
                              <Button variant="ghost" size="icon" onClick={() => setIsSelectingStyle(false)}>
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                            <div className="p-4 overflow-y-auto max-h-[60vh] space-y-2">
                              {/* None Option */}
                              <div
                                className={cn(
                                  "p-3 rounded-lg border-2 cursor-pointer transition-all",
                                  !currentStoryBase.imageryStyleId
                                    ? "border-orange-500 bg-orange-500/10"
                                    : "border-[var(--color-border)] hover:border-orange-500/50"
                                )}
                                onClick={async () => {
                                  await fetch(`/api/story-bases/${currentStoryBase.id}`, {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ imageryStyleId: null }),
                                  })
                                  setCurrentStoryBase({ ...currentStoryBase, imageryStyleId: null })
                                  setIsSelectingStyle(false)
                                }}
                              >
                                <div className="flex items-center gap-3">
                                  <X className="w-5 h-5 text-[var(--color-text-dim)]" />
                                  <span className="text-sm font-medium text-[var(--color-text)]">No Style (Default)</span>
                                </div>
                              </div>

                              {/* Available Styles */}
                              {availableStyles.map((style) => (
                                <div
                                  key={style.id}
                                  className={cn(
                                    "p-3 rounded-lg border-2 cursor-pointer transition-all",
                                    currentStoryBase.imageryStyleId === style.id
                                      ? "border-orange-500 bg-orange-500/10"
                                      : "border-[var(--color-border)] hover:border-orange-500/50"
                                  )}
                                  onClick={async () => {
                                    await fetch(`/api/story-bases/${currentStoryBase.id}`, {
                                      method: "PUT",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ imageryStyleId: style.id }),
                                    })
                                    setCurrentStoryBase({ ...currentStoryBase, imageryStyleId: style.id })
                                    setIsSelectingStyle(false)
                                    await loadStoryBases()
                                  }}
                                >
                                  <div className="flex items-center gap-3">
                                    <Palette className="w-5 h-5 text-orange-400" />
                                    <div className="flex-1">
                                      <p className="text-sm font-semibold text-[var(--color-text)]">{style.name}</p>
                                      <p className="text-xs text-[var(--color-text-muted)]">{style.description}</p>
                                    </div>
                                    {currentStoryBase.imageryStyleId === style.id && (
                                      <Check className="w-5 h-5 text-orange-500" />
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Add Element Button */}
                      <Button size="sm" onClick={handleAddElement}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add {getElementLabel(activeTab).slice(0, -1)}
                      </Button>

                  {/* Element Editor */}
                  {editingElement.type === activeTab && (editingElement.id !== null || editingElement.type === activeTab) && (
                    <Card className="border-2 border-orange-500">
                      <CardHeader>
                        <CardTitle className="text-sm">
                          {editingElement.id ? "Edit" : "New"} {getElementLabel(activeTab).slice(0, -1)}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <input
                          type="text"
                          value={elementName}
                          onChange={(e) => setElementName(e.target.value)}
                          placeholder="Name"
                          className="w-full px-3 py-2 text-sm bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                        <textarea
                          value={elementDescription}
                          onChange={(e) => setElementDescription(e.target.value)}
                          placeholder="Description"
                          rows={3}
                          className="w-full px-3 py-2 text-sm bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={handleSaveElement}>
                            <Save className="w-3 h-3 mr-1" />
                            Save
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingElement({ type: activeTab, id: null })
                              setElementName("")
                              setElementDescription("")
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Element List */}
                  <div className="space-y-2">
                    {currentStoryBase[activeTab].length === 0 ? (
                      <p className="text-sm text-[var(--color-text-dim)] text-center py-8">
                        No {activeTab} yet. Click "Add" to create one.
                      </p>
                    ) : (
                      currentStoryBase[activeTab].map((element: any) => (
                        <Card key={element.id}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-semibold text-[var(--color-text)]">
                                  {element.name}
                                </h4>
                                <p className="text-xs text-[var(--color-text-muted)] mt-1 line-clamp-2">
                                  {element.description}
                                </p>
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEditElement(activeTab, element)}
                                  className="h-8 w-8"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteElement(activeTab, element.id)}
                                  className="h-8 w-8 text-red-500 hover:text-red-600"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                    </>
                  )}
                </div>

                {/* Footer - Select Story Base */}
                <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-background)]">
                  <Button
                    onClick={handleSelectStoryBase}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Use This Story Base
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <Layers className="w-16 h-16 mx-auto mb-4 text-[var(--color-text-dim)]" />
                  <p className="text-lg text-[var(--color-text)] font-semibold">
                    No Story Base Selected
                  </p>
                  <p className="text-sm text-[var(--color-text-muted)] mt-1">
                    Select or create a story base to get started
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}




