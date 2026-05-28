import { useState, useEffect, useRef } from "react"
import { User, Plus, Edit2, Trash2, X, Image as ImageIcon, Save, XCircle } from "lucide-react"
import { Button } from "./Button"
import { Card, CardContent, CardHeader, CardTitle } from "./Card"
import { cn } from "@/lib/utils"

interface Character {
  id: string
  name: string
  alias: string
  images: string[]
  description?: string
  profilePicture?: string
  createdAt: number
  updatedAt?: number
}

interface CharacterDisplayProps {
  onCharacterClick?: (alias: string) => void
  gridColumns?: number
  onGridColumnsChange?: (cols: number) => void
}

export function CharacterDisplay({ onCharacterClick, gridColumns = 3, onGridColumnsChange }: CharacterDisplayProps) {
  const [characters, setCharacters] = useState<Character[]>([])
  const [fullCharacters, setFullCharacters] = useState<Record<string, Character>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [editingAlias, setEditingAlias] = useState("")
  const [newImages, setNewImages] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [createName, setCreateName] = useState("")
  const [createAlias, setCreateAlias] = useState("")
  const [createImages, setCreateImages] = useState<string[]>([])
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editFileInputRef = useRef<HTMLInputElement>(null)

  const loadCharacters = async () => {
    try {
      const response = await fetch("/api/characters")
      if (response.ok) {
        const data = await response.json()
        const sorted = data.sort((a: Character, b: Character) => b.createdAt - a.createdAt)
        // Debug: log first character to check image format
        if (sorted.length > 0) {
          console.log("First character:", {
            name: sorted[0].name,
            hasProfilePicture: !!sorted[0].profilePicture,
            profilePicturePrefix: sorted[0].profilePicture?.substring(0, 30),
            hasImages: sorted[0].images?.length > 0,
            firstImagePrefix: sorted[0].images?.[0]?.substring(0, 30)
          })
        }
        setCharacters(sorted)
      }
    } catch (error) {
      console.error("Error loading characters:", error)
    }
  }

  useEffect(() => {
    loadCharacters()
    const interval = setInterval(loadCharacters, 5000)
    return () => clearInterval(interval)
  }, [])

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

  const startEdit = async (character: Character) => {
    setEditingId(character.id)
    setEditingName(character.name)
    setEditingAlias(character.alias)
    setNewImages([])
    setViewingId(null)
  }

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

  const handleDelete = async (id: string, alias: string) => {
    if (!confirm(`Are you sure you want to delete character "${alias}"?`)) return
    try {
      const response = await fetch(`/api/characters/${id}`, { method: "DELETE" })
      if (!response.ok) throw new Error("Failed to delete character")
      loadCharacters()
    } catch (error) {
      alert("Failed to delete character")
    }
  }

  const handleRemoveImage = async (characterId: string, imageIndex: number) => {
    try {
      const response = await fetch(`/api/characters/${characterId}/images`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIndexes: [imageIndex] }),
      })
      if (!response.ok) throw new Error("Failed to remove image")
      const updatedCharacter = await response.json()
      setFullCharacters((prev) => ({ ...prev, [characterId]: updatedCharacter }))
      loadCharacters()
      if (editingId === characterId) await loadFullCharacter(characterId)
    } catch (error) {
      alert("Failed to remove image")
    }
  }

  const toggleViewImages = async (character: Character) => {
    if (viewingId === character.id) {
      setViewingId(null)
    } else {
      setViewingId(character.id)
      await loadFullCharacter(character.id)
    }
  }

  // Use dynamic grid columns from props
  const GRID_COLUMNS = gridColumns || 3  // Default to 3 if not provided
  const MAX_ROWS = 3      // 3 rows vertically (maximum)
  const MAX_DISPLAYED = GRID_COLUMNS * MAX_ROWS
  
  const recentCharacters = characters.slice(0, MAX_DISPLAYED)
  const remainingCount = Math.max(0, characters.length - MAX_DISPLAYED)
  const [viewMode, setViewMode] = useState<"recent" | "manager">("recent")
  const [showAllModal, setShowAllModal] = useState(false)

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between mb-3">
          <CardTitle className="text-sm">AI Avatars</CardTitle>
          {/* Grid Adjuster */}
          {onGridColumnsChange && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-text-dim)] font-medium">Grid:</span>
              {[1, 2, 3, 4, 5, 6].map((cols) => (
                <button
                  key={cols}
                  onClick={() => onGridColumnsChange(cols)}
                  className={cn(
                    "px-2 py-1 text-xs font-medium rounded-md transition-all border",
                    gridColumns === cols
                      ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                      : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-primary)] hover:text-[var(--color-text)]"
                  )}
                >
                  {cols}x∞
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Mode buttons - similar to Image/Video generation */}
        <div className="flex gap-2">
          <Button
            variant={viewMode === "recent" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setViewMode("recent")
              setCreating(false)
              setEditingId(null)
              setViewingId(null)
            }}
            className="flex-1 h-8 text-xs"
          >
            AI Avatars
          </Button>
          <Button
            variant={viewMode === "manager" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setViewMode("manager")
              setCreating(false)
              setEditingId(null)
              setViewingId(null)
            }}
            className="flex-1 h-8 text-xs"
          >
            AI Avatar Management
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* AI Avatars View - Compact 5x3 Grid */}
        {viewMode === "recent" && (
          <>
            {recentCharacters.length > 0 ? (
              <>
                {/* Dynamic grid based on user preference */}
                <div 
                  className="grid gap-2"
                  style={{ gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))` }}
                >
                  {recentCharacters.map((character) => (
                    <button
                      key={character.id}
                      onClick={() => onCharacterClick?.(character.alias)}
                      className="flex flex-col items-center p-1.5 rounded-lg hover:bg-[var(--color-surface)] transition-colors group"
                      title={`${character.name} (@${character.alias})`}
                    >
                      {/* Small square image 48x48 */}
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-[var(--color-background)] border border-[var(--color-border)] mb-1">
                        {!imageErrors[character.id] && (character.profilePicture || (character.images && character.images.length > 0)) ? (
                          <img
                            src={
                              character.profilePicture
                                ? (character.profilePicture.startsWith('data:') ? character.profilePicture : `data:image/png;base64,${character.profilePicture}`)
                                : character.images[0]
                            }
                            alt={character.name}
                            className="w-full h-full object-cover"
                            onError={() => setImageErrors(prev => ({ ...prev, [character.id]: true }))}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-lg font-semibold text-[var(--color-text-dim)]">
                            {character.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      
                      {/* Truncated name */}
                      <span className="text-xs text-center truncate w-full max-w-[60px] text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]">
                        {character.name}
                      </span>
                    </button>
                  ))}
                </div>
                
                {/* Show count of remaining characters */}
                {remainingCount > 0 && (
                  <div className="text-center mt-2">
                    <p className="text-xs text-[var(--color-text-dim)]">
                      +{remainingCount} more character{remainingCount !== 1 ? 's' : ''}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setViewMode("manager")}
                      className="text-xs h-6 mt-1"
                    >
                      View All
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-[var(--color-text-dim)] text-center py-2">
                No characters yet
              </p>
            )}
          </>
        )}

        {/* AI Avatar Management View */}
        {viewMode === "manager" && (
          <div className="space-y-4">
              {/* Create New Character */}
              {creating ? (
                <div className="space-y-3 p-3 bg-[var(--color-background)] rounded-lg border border-[var(--color-border)]">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold">New Character</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCreating(false)
                        setCreateName("")
                        setCreateAlias("")
                        setCreateImages([])
                      }}
                      className="h-6 w-6 p-0"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                  <div>
                    <input
                      type="text"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="Character name"
                      className="w-full px-2 py-1.5 text-xs border rounded bg-[var(--color-surface)]"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={createAlias}
                      onChange={(e) => setCreateAlias(e.target.value)}
                      placeholder="Alias (e.g., elara)"
                      className="w-full px-2 py-1.5 text-xs border rounded bg-[var(--color-surface)]"
                    />
                  </div>
                  <div>
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
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full h-7 text-xs"
                    >
                      <ImageIcon className="w-3 h-3 mr-1" />
                      Upload Images
                    </Button>
                    {createImages.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {createImages.map((img, index) => (
                          <div key={index} className="relative group">
                            <img
                              src={img}
                              alt={`Preview ${index + 1}`}
                              className="w-12 h-12 rounded object-cover border"
                            />
                            <button
                              onClick={() => removeImage(index, false)}
                              className="absolute -top-1 -right-1 p-0.5 bg-red-500 rounded-full opacity-0 group-hover:opacity-100"
                            >
                              <XCircle className="w-2.5 h-2.5 text-white" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={handleCreate}
                    disabled={!createName || !createAlias || createImages.length === 0}
                    className="w-full h-7 text-xs"
                  >
                    <Save className="w-3 h-3 mr-1" />
                    Create
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCreating(true)}
                  className="w-full h-7 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  New Character
                </Button>
              )}

            {/* All Characters List */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {characters.length === 0 && !creating ? (
                <p className="text-center text-[var(--color-text-dim)] py-8 text-xs">
                  No characters yet. Click "New Character" to create one.
                </p>
              ) : (
                characters.map((character) => {
                  return (
                  <div
                    key={character.id}
                    className={cn(
                      "p-2 rounded-lg border",
                      editingId === character.id
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5"
                        : "border-[var(--color-border)] bg-[var(--color-surface)]"
                    )}
                  >
                    {editingId === character.id ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            placeholder="Name"
                            className="flex-1 px-2 py-1 text-xs border rounded bg-[var(--color-surface)]"
                          />
                          <input
                            type="text"
                            value={editingAlias}
                            onChange={(e) => setEditingAlias(e.target.value)}
                            placeholder="Alias"
                            className="flex-1 px-2 py-1 text-xs border rounded bg-[var(--color-surface)]"
                          />
                        </div>
                        <div>
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
                            className="h-6 text-xs"
                          >
                            <ImageIcon className="w-3 h-3 mr-1" />
                            Add Images
                          </Button>
                          {newImages.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {newImages.map((img, index) => (
                                <div key={index} className="relative group">
                                  <img
                                    src={img}
                                    alt={`New ${index + 1}`}
                                    className="w-12 h-12 rounded object-cover border"
                                  />
                                  <button
                                    onClick={() => removeImage(index, true)}
                                    className="absolute -top-1 -right-1 p-0.5 bg-red-500 rounded-full opacity-0 group-hover:opacity-100"
                                  >
                                    <XCircle className="w-2.5 h-2.5 text-white" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1.5">
                          <Button size="sm" onClick={handleSaveEdit} className="h-6 text-xs flex-1">
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
                            className="h-6 text-xs"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {character.profilePicture ? (
                            <img
                              src={character.profilePicture.startsWith('data:') ? character.profilePicture : `data:image/png;base64,${character.profilePicture}`}
                              alt={character.name}
                              className="w-8 h-8 rounded object-cover border border-[var(--color-border)]"
                              onError={(e) => {
                                console.error("Failed to load profile picture for", character.name)
                                e.currentTarget.style.display = 'none'
                              }}
                            />
                          ) : character.images && character.images.length > 0 ? (
                            <img
                              src={character.images[0]}
                              alt={character.name}
                              className="w-8 h-8 rounded object-cover border border-[var(--color-border)]"
                              onError={(e) => {
                                console.error("Failed to load image for", character.name)
                                e.currentTarget.style.display = 'none'
                              }}
                            />
                          ) : (
                            <div className="w-8 h-8 rounded bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center">
                              <User className="w-4 h-4 text-[var(--color-text-dim)]" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-[var(--color-text)] truncate">
                              {character.name}
                            </p>
                            <p className="text-xs text-[var(--color-text-dim)] truncate">
                              @{character.alias}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleViewImages(character)}
                            className="h-6 w-6 p-0"
                            title="View images"
                          >
                            <ImageIcon className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEdit(character)}
                            className="h-6 w-6 p-0"
                            title="Edit"
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(character.id, character.alias)}
                            className="h-6 w-6 p-0 text-[var(--color-error)] hover:text-[var(--color-error)]"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* View Images */}
                    {viewingId === character.id && fullCharacters[character.id] && (
                      <div className="mt-2 pt-2 border-t border-[var(--color-border)]">
                        <div className="grid grid-cols-3 gap-1.5">
                          {fullCharacters[character.id].images.map((img, imgIndex) => (
                            <div key={imgIndex} className="relative group">
                              <img
                                src={img}
                                alt={`${character.name} ${imgIndex + 1}`}
                                className="w-full h-16 object-cover rounded border"
                              />
                              <button
                                onClick={() => handleRemoveImage(character.id, imgIndex)}
                                className="absolute top-0.5 right-0.5 p-0.5 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <XCircle className="w-2.5 h-2.5 text-white" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  )
                })
              )}
            </div>

          </div>
        )}
      </CardContent>
    </Card>
  )
}
