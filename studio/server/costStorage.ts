import * as fs from "fs"
import * as path from "path"

export interface StoredUsageEntry {
  id: string
  type: "chat" | "image" | "video"
  timestamp: number // Unix timestamp
  cost: number
  details: {
    model?: string
    actualModel?: string
    inputTokens?: number
    outputTokens?: number
    imageSize?: string
    duration?: number
    quality?: string
    fps?: number
    prompt?: string // Optional: store prompt for reference
  }
}

interface UsageHistoryFile {
  version: number
  entries: StoredUsageEntry[]
  lastUpdated: number
}

const DATA_DIR = path.join(process.cwd(), "data")
const HISTORY_FILE = path.join(DATA_DIR, "usage-history.json")

// Ensure data directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

// Load usage history from file
export function loadUsageHistory(): StoredUsageEntry[] {
  try {
    ensureDataDir()
    
    if (!fs.existsSync(HISTORY_FILE)) {
      return []
    }
    
    const data = fs.readFileSync(HISTORY_FILE, "utf-8")
    const historyFile: UsageHistoryFile = JSON.parse(data)
    
    return historyFile.entries || []
  } catch (error) {
    console.error("Error loading usage history:", error)
    return []
  }
}

// Save usage history to file
function saveUsageHistory(entries: StoredUsageEntry[]) {
  try {
    ensureDataDir()
    
    const historyFile: UsageHistoryFile = {
      version: 1,
      entries,
      lastUpdated: Date.now(),
    }
    
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(historyFile, null, 2), "utf-8")
  } catch (error) {
    console.error("Error saving usage history:", error)
    throw error
  }
}

// Add a new usage entry
export function addUsageEntry(entry: Omit<StoredUsageEntry, "id">): StoredUsageEntry {
  const entries = loadUsageHistory()
  
  const newEntry: StoredUsageEntry = {
    ...entry,
    id: `${entry.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  }
  
  entries.push(newEntry)
  saveUsageHistory(entries)
  
  return newEntry
}

// Get usage history with optional filters
export function getUsageHistory(filters?: {
  from?: number
  to?: number
  type?: "chat" | "image" | "video"
}): StoredUsageEntry[] {
  let entries = loadUsageHistory()
  
  if (filters) {
    if (filters.from) {
      entries = entries.filter(e => e.timestamp >= filters.from!)
    }
    if (filters.to) {
      entries = entries.filter(e => e.timestamp <= filters.to!)
    }
    if (filters.type) {
      entries = entries.filter(e => e.type === filters.type)
    }
  }
  
  // Sort by timestamp descending (newest first)
  return entries.sort((a, b) => b.timestamp - a.timestamp)
}

// Get summary statistics for a time period
export function getUsageSummary(period: "today" | "week" | "month" | "year" | "all") {
  const entries = loadUsageHistory()
  const now = Date.now()
  
  let fromTimestamp = 0
  
  switch (period) {
    case "today":
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      fromTimestamp = today.getTime()
      break
    case "week":
      fromTimestamp = now - 7 * 24 * 60 * 60 * 1000
      break
    case "month":
      fromTimestamp = now - 30 * 24 * 60 * 60 * 1000
      break
    case "year":
      fromTimestamp = now - 365 * 24 * 60 * 60 * 1000
      break
    case "all":
      fromTimestamp = 0
      break
  }
  
  const filteredEntries = entries.filter(e => e.timestamp >= fromTimestamp)
  
  const chatCost = filteredEntries.filter(e => e.type === "chat").reduce((sum, e) => sum + e.cost, 0)
  const imageCost = filteredEntries.filter(e => e.type === "image").reduce((sum, e) => sum + e.cost, 0)
  const videoCost = filteredEntries.filter(e => e.type === "video").reduce((sum, e) => sum + e.cost, 0)
  
  const chatCount = filteredEntries.filter(e => e.type === "chat").length
  const imageCount = filteredEntries.filter(e => e.type === "image").length
  const videoCount = filteredEntries.filter(e => e.type === "video").length
  
  return {
    period,
    fromTimestamp,
    toTimestamp: now,
    totalCost: chatCost + imageCost + videoCost,
    chatCost,
    imageCost,
    videoCost,
    chatCount,
    imageCount,
    videoCount,
    totalCount: filteredEntries.length,
  }
}

// Clear all usage history
export function clearUsageHistory() {
  try {
    ensureDataDir()
    
    const emptyHistory: UsageHistoryFile = {
      version: 1,
      entries: [],
      lastUpdated: Date.now(),
    }
    
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(emptyHistory, null, 2), "utf-8")
    
    return true
  } catch (error) {
    console.error("Error clearing usage history:", error)
    return false
  }
}

// Delete a specific entry
export function deleteUsageEntry(entryId: string): boolean {
  try {
    const entries = loadUsageHistory()
    const filteredEntries = entries.filter(e => e.id !== entryId)
    
    if (filteredEntries.length === entries.length) {
      return false // Entry not found
    }
    
    saveUsageHistory(filteredEntries)
    return true
  } catch (error) {
    console.error("Error deleting usage entry:", error)
    return false
  }
}





