import { useState, useEffect, useRef } from "react"
import { User, Plus, Edit2, Trash2, X, Image as ImageIcon, Save, XCircle, ChevronUp, ChevronDown } from "lucide-react"
import { Button } from "./Button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./Card"
import { cn } from "@/lib/utils"

interface Character {
  id: string
  name: string
  alias: string
  images: string[]
  description?: string
  createdAt: number
  updatedAt: number
}

interface CharacterManagerProps {
  onCharacterSelect?: (character: Character) => void
  isExpanded?: boolean
  onToggleExpand?: () => void
}

export function CharacterManager({ onCharacterSelect, isExpanded = true, onToggleExpand }: CharacterManagerProps) {
  const [characters, setCharacters] = useState<Character[]>([])
  const [fullCharacters, setFullCharacters] = useState<Record<string, Character>>({})
  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [editingAlias, setEditingAlias] = useState("")
  const [newImages, setNewImages] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [createName, setCreateName] = useState("")
  const [createAlias, setCreateAlias] = useState("")
  const [createImages, setCreateImages] = useState<string[]>([])
  const [viewingId, setViewingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editFileInputRef = useRef<HTMLInputElement>(null)

  // Load characters
  const loadCharacters = async () => {
    try {
      const response = await fetch("/api/characters")
      if (response.ok) {
        const data = await response.json()
        setCharacters(data)
      }
    } catch (error) {
      console.error("Error loading characters:", error)
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadCharacters()
    }
  }, [isOpen])

  // Handle image upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean = false) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach((file) => {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader()
        reader.onload = () => {
          const base64 = reader.result as string
          if (isEdit) {
            setNewImages((prev) => [...prev, base64])
          } else {
            setCreateImages((prev) => [...prev, base64])
          }
        }
        reader.readAsDataURL(file)
      }
    })

    if (isEdit && editFileInputRef.current) {
      editFileInputRef.current.value = ""
    } else if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const removeImage = (index: number, isEdit: boolean = false) => {
    if (isEdit) {
      setNewImages((prev) => prev.filter((_, i) => i !== index))
    } else {
      setCreateImages((prev) => prev.filter((_, i) => i !== index))
    }
  }

  // Create character
  const handleCreate = async () => {
    if (!createName.trim() || !createAlias.trim() || createImages.length === 0) {
      alert("Please provide a name, alias, and at least one image")
      return
    }

    try {
      const response = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName,
          alias: createAlias,
          images: createImages,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || "Failed to create character")
      }

      setCreateName("")
      setCreateAlias("")
      setCreateImages([])
      setCreating(false)
      loadCharacters()
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to create character")
    }
  }

  // Load full character data
  const loadFullCharacter = async (id: string) => {
    if (fullCharacters[id]) return fullCharacters[id]
    
    try {
      const response = await fetch(`/api/characters/${id}`)
      if (response.ok) {
        const fullChar = await response.json()
        setFullCharacters((prev) => ({ ...prev, [id]: fullChar }))
        return fullChar
      }
    } catch (error) {
      console.error("Error loading character:", error)
    }
    return null
  }

  // Start editing
  const startEdit = async (character: Character) => {
    setEditingId(character.id)
    setEditingName(character.name)
    setEditingAlias(character.alias)
    setNewImages([])
    setViewingId(null)
  }

  // Toggle view images
  const toggleViewImages = async (character: Character) => {
    if (viewingId === character.id) {
      setViewingId(null)
    } else {
      setViewingId(character.id)
      await loadFullCharacter(character.id)
    }
  }

  // Save edit
  const handleSaveEdit = async () => {
    if (!editingId || !editingName.trim() || !editingAlias.trim()) {
      alert("Please provide a name and alias")
      return
    }

    try {
      const response = await fetch(`/api/characters/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingName,
          alias: editingAlias,
          images: newImages.length > 0 ? newImages : undefined,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || "Failed to update character")
      }

      setEditingId(null)
      setEditingName("")
      setEditingAlias("")
      setNewImages([])
      loadCharacters()
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update character")
    }
  }

  // Delete character
  const handleDelete = async (id: string, alias: string) => {
    if (!confirm(`Are you sure you want to delete character "${alias}"?`)) return

    try {
      const response = await fetch(`/api/characters/${id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete character")
      }

      loadCharacters()
    } catch (error) {
      alert("Failed to delete character")
    }
  }

  // Remove image from character
  const handleRemoveImage = async (characterId: string, imageIndex: number) => {
    try {
      const response = await fetch(`/api/characters/${characterId}/images`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageIndexes: [imageIndex],
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to remove image")
      }

      // Reload the full character data to update the UI
      const updatedCharacter = await response.json()
      
      // Update the full character in state if it's loaded
      setFullCharacters((prev) => ({
        ...prev,
        [characterId]: updatedCharacter,
      }))
      
      // Also reload the character list
      loadCharacters()
      
      // If we're editing this character, reload it to show updated images
      if (editingId === characterId) {
        await loadFullCharacter(characterId)
      }
    } catch (error) {
      alert("Failed to remove image")
    }
  }

  return (
    <>
      {/* Toggle Button */}
      <Button
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="mb-4"
      >
        <User className="w-4 h-4 mr-2" />
        Character Manager
      </Button>

      {isOpen && (
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Character Manager</CardTitle>
                <CardDescription>Train and manage your characters</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {onToggleExpand && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onToggleExpand}
                    className="ml-auto"
                    aria-label={isExpanded ? "Collapse character manager" : "Expand character manager"}
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5" />
                    ) : (
                      <ChevronDown className="w-5 h-5" />
                    )}
                  </Button>
                )}
                {!creating && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCreating(true)}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    New Character
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setIsOpen(false)
                    setCreating(false)
                    setEditingId(null)
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          
          <div className={cn(
            "overflow-hidden transition-all duration-300 ease-in-out",
            isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
          )}>
            <CardContent className="space-y-4">
            {/* Create New Character */}
            {creating && (
              <Card className="border-2 border-dashed">
                <CardHeader>
                  <CardTitle className="text-lg">Create New Character</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Character Name</label>
                    <input
                      type="text"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="e.g., Princess Elara"
                      className="w-full px-3 py-2 border rounded-lg bg-[var(--color-surface)]"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Alias (for @mentions)</label>
                    <input
                      type="text"
                      value={createAlias}
                      onChange={(e) => setCreateAlias(e.target.value)}
                      placeholder="e.g., elara"
                      className="w-full px-3 py-2 border rounded-lg bg-[var(--color-surface)]"
                    />
                    <p className="text-xs text-[var(--color-text-dim)] mt-1">
                      Use @{createAlias || "alias"} in prompts to reference this character
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Character Images</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleImageUpload(e, false)}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full"
                    >
                      <ImageIcon className="w-4 h-4 mr-2" />
                      Upload Images
                    </Button>
                    {createImages.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {createImages.map((img, index) => (
                          <div key={index} className="relative group">
                            <img
                              src={img}
                              alt={`Preview ${index + 1}`}
                              className="w-20 h-20 rounded-lg object-cover border"
                            />
                            <button
                              onClick={() => removeImage(index, false)}
                              className="absolute -top-1 -right-1 p-0.5 bg-red-500 rounded-full opacity-0 group-hover:opacity-100"
                            >
                              <XCircle className="w-3 h-3 text-white" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleCreate} disabled={!createName || !createAlias || createImages.length === 0}>
                      <Save className="w-4 h-4 mr-2" />
                      Create Character
                    </Button>
                    <Button variant="outline" onClick={() => {
                      setCreating(false)
                      setCreateName("")
                      setCreateAlias("")
                      setCreateImages([])
                    }}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Characters List */}
            <div className="space-y-3">
              {characters.length === 0 && !creating ? (
                <p className="text-center text-[var(--color-text-dim)] py-8">
                  No characters yet. Click "New Character" to create one.
                </p>
              ) : (
                characters.map((character) => (
                  <Card key={character.id} className={editingId === character.id ? "border-2 border-[var(--color-primary)]" : ""}>
                    <CardContent className="p-4">
                      {editingId === character.id ? (
                        // Edit Mode
                        <div className="space-y-3">
                          <div>
                            <label className="text-sm font-medium mb-1 block">Name</label>
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="w-full px-3 py-2 border rounded-lg bg-[var(--color-surface)]"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium mb-1 block">Alias</label>
                            <input
                              type="text"
                              value={editingAlias}
                              onChange={(e) => setEditingAlias(e.target.value)}
                              className="w-full px-3 py-2 border rounded-lg bg-[var(--color-surface)]"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium mb-1 block">Add More Images</label>
                            <input
                              ref={editFileInputRef}
                              type="file"
                              accept="image/*"
                              multiple
                              onChange={(e) => handleImageUpload(e, true)}
                              className="hidden"
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => editFileInputRef.current?.click()}
                            >
                              <ImageIcon className="w-3 h-3 mr-1" />
                              Add Images
                            </Button>
                            {newImages.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {newImages.map((img, index) => (
                                  <div key={index} className="relative group">
                                    <img
                                      src={img}
                                      alt={`New ${index + 1}`}
                                      className="w-16 h-16 rounded object-cover border"
                                    />
                                    <button
                                      onClick={() => removeImage(index, true)}
                                      className="absolute -top-1 -right-1 p-0.5 bg-red-500 rounded-full opacity-0 group-hover:opacity-100"
                                    >
                                      <XCircle className="w-3 h-3 text-white" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={handleSaveEdit}>
                              <Save className="w-3 h-3 mr-1" />
                              Save
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingId(null)
                                setEditingName("")
                                setEditingAlias("")
                                setNewImages([])
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        // View Mode
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="font-semibold">{character.name}</h3>
                                <span className="text-xs text-[var(--color-text-dim)] bg-[var(--color-surface)] px-2 py-1 rounded">
                                  @{character.alias}
                                </span>
                              </div>
                              {character.description && (
                                <p className="text-sm text-[var(--color-text-muted)] mb-2 line-clamp-2">
                                  {character.description}
                                </p>
                              )}
                              <p className="text-xs text-[var(--color-text-dim)]">
                                {character.imageCount} image{character.imageCount !== 1 ? "s" : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {onCharacterSelect && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    const fullChar = await loadFullCharacter(character.id)
                                    if (fullChar) onCharacterSelect(fullChar)
                                  }}
                                >
                                  Use
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => toggleViewImages(character)}
                                title="View images"
                              >
                                <ImageIcon className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => startEdit(character)}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(character.id, character.alias)}
                              >
                                <Trash2 className="w-4 h-4 text-[var(--color-error)]" />
                              </Button>
                            </div>
                          </div>
                          
                          {/* Show images when viewing */}
                          {viewingId === character.id && fullCharacters[character.id] && (
                            <div className="border-t pt-3">
                              <p className="text-xs font-medium mb-2">Character Images:</p>
                              <div className="grid grid-cols-3 gap-2">
                                {fullCharacters[character.id].images.map((img, imgIndex) => (
                                  <div key={imgIndex} className="relative group">
                                    <img
                                      src={img}
                                      alt={`${character.name} ${imgIndex + 1}`}
                                      className="w-full h-24 object-cover rounded border"
                                    />
                                    <button
                                      onClick={() => handleRemoveImage(character.id, imgIndex)}
                                      className="absolute top-1 right-1 p-1 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <XCircle className="w-3 h-3 text-white" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
            </CardContent>
          </div>
        </Card>
      )}
    </>
  )
}

