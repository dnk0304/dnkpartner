# DNK Studio Data Organization

This document describes the organized folder structure for storing data from different features in DNK Studio.

## Folder Structure

```
dennisproject/
└── data/
    ├── amazon/          # Amazon data scraping
    │   ├── historical.json
    │   └── snapshots.json
    │
    ├── trends/          # AI Trends data
    │   └── exploding-trends.json
    │
    ├── kdp/             # ✨ KDP Publishing Mode
    │   ├── projects/    # Project metadata (JSON files)
    │   │   └── [project-id].json
    │   └── assets/      # Cover images, page images
    │       └── [project-id]_[type].[ext]
    │
    ├── characters/      # Character Manager
    │   └── (future: character definitions)
    │
    ├── story-bases/     # Story Base Manager
    │   └── (future: story templates)
    │
    ├── rescaler/        # Image Rescaler
    │   └── (future: saved sessions)
    │
    └── prompts/         # Prompt Templates
        └── (future: saved prompt sets)
```

## KDP Project Storage

### How It Works

1. **Projects are saved to disk** instead of localStorage (no 5MB limit!)
2. **Images are extracted** from base64 data URLs and saved as separate files
3. **Fast loading** - metadata loads quickly, images load on demand
4. **Automatic migration** - old localStorage projects are migrated on first load

### API Endpoints

- `POST /api/kdp/projects/save` - Save a project
- `GET /api/kdp/projects` - List all projects (metadata only)
- `GET /api/kdp/projects/:id` - Load a specific project (with images)
- `DELETE /api/kdp/projects/:id` - Delete a project and its assets
- `GET /kdp-assets/:filename` - Serve project assets (images)

### Project JSON Structure

```json
{
  "id": "project-123",
  "name": "My Book",
  "trimSize": "6x9",
  "pageCount": 120,
  "cover": {
    "frontImage": {
      "src": "/kdp-assets/project-123_cover_front.png"  // ← File path instead of data URL
    }
  },
  "pages": [...],
  "createdAt": 1234567890,
  "updatedAt": 1234567890
}
```

### Asset Naming Convention

Assets are named using the pattern: `{projectId}_{type}.{ext}`

Examples:
- `project-123_cover_front.png` - Front cover image
- `project-123_cover_back.jpg` - Back cover image
- `project-123_page0_img0.png` - First image on first page
- `project-123_thumbnail.png` - Project thumbnail

## Benefits

✅ **No localStorage limits** - Projects can be any size  
✅ **Faster loading** - Metadata loads instantly, images on demand  
✅ **Organized** - Each feature has its own folder  
✅ **Portable** - Easy to backup/restore  
✅ **Scalable** - Add new features without conflicts  
✅ **Automatic migration** - Existing projects migrate seamlessly

## Future Features

The folder structure is ready for additional features:

- **Character Manager** - Save character definitions to `data/characters/`
- **Story Base Manager** - Save story templates to `data/story-bases/`
- **Rescaler** - Save rescaling sessions to `data/rescaler/`
- **Prompt Templates** - Save prompt sets to `data/prompts/`

Each feature can use the same pattern:
1. Create a storage utility (like `kdpStorage.ts`)
2. Add API endpoints to `server/index.ts`
3. Update the frontend to use server storage

## Migration

Old projects stored in localStorage are automatically migrated on first load:
1. System detects localStorage projects
2. Each project is saved to server storage
3. localStorage is cleared after successful migration
4. User sees all projects in the new system

No data is lost! 🎉

