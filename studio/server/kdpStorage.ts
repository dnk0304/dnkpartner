import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import sharp from "sharp"
import zlib from "zlib"
import { promisify } from "util"

const gzip = promisify(zlib.gzip)
const gunzip = promisify(zlib.gunzip)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// KDP storage directories
const KDP_BASE_DIR = path.join(__dirname, "../data/kdp")
const PROJECTS_DIR = path.join(KDP_BASE_DIR, "projects")
const ASSETS_DIR = path.join(KDP_BASE_DIR, "assets")

// Ensure directories exist
async function ensureDirectories() {
  await fs.mkdir(PROJECTS_DIR, { recursive: true })
  await fs.mkdir(ASSETS_DIR, { recursive: true })
}

// Initialize storage
ensureDirectories().catch(console.error)

// Save a KDP project
export async function saveKDPProject(project: any): Promise<void> {
  await ensureDirectories()
  
  // Separate images from project data
  const projectData = { ...project }
  const assets: { [key: string]: string } = {}
  
  // Process cover images
  if (project.cover) {
    if (project.cover.frontImage?.src?.startsWith('data:')) {
      const assetPath = await saveAsset(project.cover.frontImage.src, `${project.id}_cover_front`)
      projectData.cover.frontImage.src = assetPath
      assets[`cover.frontImage.src`] = assetPath
    }
    if (project.cover.backImage?.src?.startsWith('data:')) {
      const assetPath = await saveAsset(project.cover.backImage.src, `${project.id}_cover_back`)
      projectData.cover.backImage.src = assetPath
      assets[`cover.backImage.src`] = assetPath
    }
    if (project.cover.spineImage?.src?.startsWith('data:')) {
      const assetPath = await saveAsset(project.cover.spineImage.src, `${project.id}_cover_spine`)
      projectData.cover.spineImage.src = assetPath
      assets[`cover.spineImage.src`] = assetPath
    }
    if (project.cover.fullCoverImage?.src?.startsWith('data:')) {
      const assetPath = await saveAsset(project.cover.fullCoverImage.src, `${project.id}_cover_full`)
      projectData.cover.fullCoverImage.src = assetPath
      assets[`cover.fullCoverImage.src`] = assetPath
    }
  }
  
  // Process page images
  if (project.pages && Array.isArray(project.pages)) {
    for (let pageIndex = 0; pageIndex < project.pages.length; pageIndex++) {
      const page = project.pages[pageIndex]
      if (page.images && Array.isArray(page.images)) {
        for (let imgIndex = 0; imgIndex < page.images.length; imgIndex++) {
          const img = page.images[imgIndex]
          if (img.src?.startsWith('data:')) {
            const assetPath = await saveAsset(img.src, `${project.id}_page${pageIndex}_img${imgIndex}`)
            projectData.pages[pageIndex].images[imgIndex].src = assetPath
            assets[`pages.${pageIndex}.images.${imgIndex}.src`] = assetPath
          }
        }
      }
    }
  }
  
  // Process thumbnail
  if (project.thumbnail?.startsWith('data:')) {
    const assetPath = await saveAsset(project.thumbnail, `${project.id}_thumbnail`)
    projectData.thumbnail = assetPath
    assets[`thumbnail`] = assetPath
  }
  
  // Save project JSON with gzip compression
  const projectPath = path.join(PROJECTS_DIR, `${project.id}.json`)
  const jsonData = JSON.stringify(projectData)
  const compressedData = await gzip(jsonData)
  await fs.writeFile(projectPath, compressedData)
  
  console.log(`[KDP Storage] Saved project ${project.id} with ${Object.keys(assets).length} assets`)
  console.log(`[KDP Storage] JSON size: ${jsonData.length} bytes, compressed: ${compressedData.length} bytes (${Math.round((1 - compressedData.length / jsonData.length) * 100)}% reduction)`)
}

// Load a KDP project
export async function loadKDPProject(projectId: string): Promise<any> {
  const projectPath = path.join(PROJECTS_DIR, `${projectId}.json`)
  
  try {
    const compressedData = await fs.readFile(projectPath)
    
    // Try to decompress (new format)
    let data: string
    try {
      const decompressed = await gunzip(compressedData)
      data = decompressed.toString('utf-8')
    } catch {
      // Fallback to uncompressed (old format)
      data = compressedData.toString('utf-8')
    }
    
    const project = JSON.parse(data)
    
    // Convert asset paths back to data URLs for the frontend
    await loadProjectAssets(project)
    
    return project
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`Project ${projectId} not found`)
    }
    throw error
  }
}

// Load all KDP projects (metadata only, no images)
export async function listKDPProjects(): Promise<any[]> {
  await ensureDirectories()
  
  try {
    const files = await fs.readdir(PROJECTS_DIR)
    const jsonFiles = files.filter(f => f.endsWith('.json'))
    
    const projects = await Promise.all(
      jsonFiles.map(async (file) => {
        try {
          const compressedData = await fs.readFile(path.join(PROJECTS_DIR, file))
          
          // Try to decompress (new format)
          let data: string
          try {
            const decompressed = await gunzip(compressedData)
            data = decompressed.toString('utf-8')
          } catch {
            // Fallback to uncompressed (old format)
            data = compressedData.toString('utf-8')
          }
          
          const project = JSON.parse(data)
          
          // Load only thumbnail for list view
          if (project.thumbnail && !project.thumbnail.startsWith('data:')) {
            project.thumbnail = await loadAsset(project.thumbnail)
          }
          
          // Return metadata only (exclude heavy data)
          return {
            id: project.id,
            name: project.name,
            bookType: project.bookType,
            trimSize: project.trimSize,
            pageCount: project.pageCount,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
            thumbnail: project.thumbnail,
          }
        } catch (error) {
          console.error(`Failed to load project ${file}:`, error)
          return null
        }
      })
    )
    
    return projects.filter(p => p !== null)
  } catch (error) {
    console.error('Failed to list KDP projects:', error)
    return []
  }
}

// Delete a KDP project and its assets
export async function deleteKDPProject(projectId: string): Promise<void> {
  console.log(`[KDP Storage] Starting deletion of project: ${projectId}`)
  const projectPath = path.join(PROJECTS_DIR, `${projectId}.json`)
  
  // Ensure directories exist first
  try {
    await ensureDirectories()
  } catch (error: any) {
    console.error(`[KDP Storage] Failed to ensure directories:`, error.message)
    throw new Error(`Failed to access storage directories: ${error.message}`)
  }
  
  // Delete all associated assets (based on naming pattern)
  const assetPattern = new RegExp(`^${projectId}_`)
  let deletedAssets = 0
  
  try {
    const assetFiles = await fs.readdir(ASSETS_DIR)
    console.log(`[KDP Storage] Found ${assetFiles.length} total assets`)
    
    const projectAssets = assetFiles.filter(f => assetPattern.test(f))
    console.log(`[KDP Storage] Found ${projectAssets.length} assets for project ${projectId}`)
    
    await Promise.all(
      projectAssets.map(async (f) => {
        try {
          await fs.unlink(path.join(ASSETS_DIR, f))
          deletedAssets++
          console.log(`[KDP Storage] Deleted asset: ${f}`)
        } catch (err: any) {
          console.warn(`[KDP Storage] Could not delete asset ${f}:`, err.message)
        }
      })
    )
  } catch (readDirError: any) {
    console.warn(`[KDP Storage] Could not read assets directory:`, readDirError.message)
    // Continue even if we can't read the assets directory
  }
  
  // Delete project file
  try {
    console.log(`[KDP Storage] Attempting to delete project file: ${projectPath}`)
    await fs.unlink(projectPath)
    console.log(`[KDP Storage] Successfully deleted project ${projectId} (${deletedAssets} assets removed)`)
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // Project doesn't exist - this is fine, just log it
      console.log(`[KDP Storage] Project ${projectId} not found, may have been already deleted`)
      return
    }
    // Re-throw other errors with more context
    console.error(`[KDP Storage] Failed to delete project file:`, error)
    throw new Error(`Failed to delete project file: ${error.message}`)
  }
}

// Save an asset (image) to disk with compression
async function saveAsset(dataUrl: string, baseName: string): Promise<string> {
  // Extract mime type and base64 data
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!matches) {
    throw new Error('Invalid data URL')
  }
  
  const mimeType = matches[1]
  const base64Data = matches[2]
  const buffer = Buffer.from(base64Data, 'base64')
  
  // Optimize image with sharp (compress and optimize)
  let optimizedBuffer: Buffer
  let extension: string
  
  try {
    // Convert to WebP for maximum compression (lossless for quality preservation)
    // WebP provides 25-35% better compression than PNG/JPEG
    optimizedBuffer = await sharp(buffer)
      .webp({ 
        quality: 90,        // High quality
        lossless: false,    // Lossy compression for better size reduction
        effort: 6           // Maximum compression effort (0-6)
      })
      .toBuffer()
    
    extension = 'webp'
    
    console.log(`[KDP Storage] Image ${baseName}: ${buffer.length} -> ${optimizedBuffer.length} bytes (${Math.round((1 - optimizedBuffer.length / buffer.length) * 100)}% reduction)`)
  } catch (error) {
    console.error(`[KDP Storage] Failed to optimize image ${baseName}, using original:`, error)
    optimizedBuffer = buffer
    extension = mimeType.split('/')[1] || 'png'
  }
  
  const filename = `${baseName}.${extension}`
  const assetPath = path.join(ASSETS_DIR, filename)
  
  // Save optimized image
  await fs.writeFile(assetPath, optimizedBuffer)
  
  // Return relative path (for storage in JSON)
  return `/kdp-assets/${filename}`
}

// Load an asset from disk as data URL
async function loadAsset(assetPath: string): Promise<string> {
  // Convert path like "/kdp-assets/xxx.png" to file path
  const filename = path.basename(assetPath)
  const filePath = path.join(ASSETS_DIR, filename)
  
  try {
    const buffer = await fs.readFile(filePath)
    const extension = path.extname(filename).toLowerCase()
    
    // Determine mime type
    const mimeTypes: { [key: string]: string } = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    }
    const mimeType = mimeTypes[extension] || 'image/png'
    
    // Convert to base64 data URL
    return `data:${mimeType};base64,${buffer.toString('base64')}`
  } catch (error) {
    console.error(`Failed to load asset ${assetPath}:`, error)
    return ''
  }
}

// Recursively load all assets in a project
async function loadProjectAssets(obj: any): Promise<void> {
  if (!obj || typeof obj !== 'object') return
  
  for (const key in obj) {
    const value = obj[key]
    
    if (typeof value === 'string' && value.startsWith('/kdp-assets/')) {
      // Load asset
      obj[key] = await loadAsset(value)
    } else if (typeof value === 'object') {
      // Recurse
      await loadProjectAssets(value)
    }
  }
}

// Export asset serving path
export function getAssetPath(filename: string): string {
  return path.join(ASSETS_DIR, filename)
}

