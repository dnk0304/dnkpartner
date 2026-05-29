# Real Image Enrichment System

## Overview

This system automatically fetches real imagery for auction items based on their type:

### Property Auctions (Viviendas, Locales, Terrenos, etc.)
- **Google Maps Street View** - Real photos of the property exterior
- **Google Maps Satellite** - Aerial view if Street View unavailable
- **Mapbox Static** - Backup satellite imagery

### Vehicle Auctions (Turismos, Motocicletas, etc.)
- **Make/Model-specific images** from Unsplash
- Extracts brand from title (BMW, Mercedes, Audi, etc.)
- Returns professional automotive photography

### Boat Auctions
- **Type-specific boat imagery** from Unsplash
- Searches for yacht, sailboat, etc. based on title

## Setup Instructions

### 1. Get API Keys

#### Google Maps API (Recommended for Properties)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable these APIs:
   - **Maps Static API**
   - **Street View Static API**
4. Go to "Credentials" → "Create Credentials" → "API Key"
5. Copy your API key

**Cost**: Google provides $200/month free credit
- Street View: $0.007 per image
- Static Maps: $0.002 per image
- ~10,000-20,000 free images per month

#### Mapbox API (Alternative for Properties)
1. Sign up at [Mapbox](https://account.mapbox.com/)
2. Go to "Access tokens"
3. Create a new token with "Static Images API" scope
4. Copy your access token

**Cost**: Free tier includes 50,000 requests/month

#### Unsplash API (For Vehicles/Boats)
1. Go to [Unsplash Developers](https://unsplash.com/developers)
2. Register as a developer
3. Create a new application
4. Copy your "Access Key"

**Cost**: Free tier includes 50 requests/hour

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```bash
# .env file
GOOGLE_MAPS_API_KEY=your-google-maps-api-key-here
MAPBOX_API_KEY=your-mapbox-token-here
UNSPLASH_ACCESS_KEY=your-unsplash-access-key-here
```

**For production** (PowerShell on Windows):
```powershell
$env:GOOGLE_MAPS_API_KEY="your-key-here"
$env:MAPBOX_API_KEY="your-key-here"
$env:UNSPLASH_ACCESS_KEY="your-key-here"
```

### 3. Install Dependencies

```bash
pip install requests python-dotenv
```

### 4. Run Image Enrichment

#### Enrich all auctions (batch)
```bash
python scripts/enrich_images.py --batch-size 1000
```

#### Enrich specific source only
```bash
python scripts/enrich_images.py --source BOE --batch-size 500
```

#### Enrich from different database
```bash
python scripts/enrich_images.py --db data/database/staging.db
```

## How It Works

### For Properties with GPS Coordinates

1. **Check Street View availability** at the location
   - If available → Use Street View (real photo of building)
   - If not → Use Satellite view

2. **Example Street View URL**:
   ```
   https://maps.googleapis.com/maps/api/streetview?
     location=40.4168,-3.7038&
     size=800x600&
     fov=90&
     pitch=0&
     key=YOUR_API_KEY
   ```

3. **Example Satellite URL**:
   ```
   https://maps.googleapis.com/maps/api/staticmap?
     center=40.4168,-3.7038&
     zoom=18&
     size=800x600&
     maptype=satellite&
     markers=color:red|40.4168,-3.7038&
     key=YOUR_API_KEY
   ```

### For Vehicles

1. **Extract brand** from title (e.g., "Subasta de BMW Serie 3")
2. **Search Unsplash** for `{brand} car automobile`
3. Return high-quality automotive photography

### For Boats

1. **Extract boat type** from title (e.g., "velero", "yate")
2. **Search Unsplash** for `{type} boat yacht`
3. Return marine photography

## Integration with Pipeline

### Option 1: Batch Enrichment (Recommended)
Run periodically to enrich new auctions:

```bash
# Add to cron job or Task Scheduler
# Run every 6 hours
0 */6 * * * python /path/to/scripts/enrich_images.py --batch-size 500
```

### Option 2: Real-time Enrichment
Integrate into the processor pipeline:

```python
# In pipeline/3_processor.py
from scripts.enrich_images import ImageEnricher, ImageConfig

enricher = ImageEnricher(ImageConfig())

# After inserting auction to database
if auction['category'] in property_categories:
    image_url = enricher.get_property_image_url(
        auction['latitude'], 
        auction['longitude'],
        auction['address']
    )
    if image_url:
        db.execute('UPDATE Auction SET imageUrl = ? WHERE id = ?', 
                   (image_url, auction['id']))
```

## API Cost Estimates

For **13,447 auctions** in database:

### Google Maps
- **Properties (~10,000 items)**: 
  - Street View: 10,000 × $0.007 = $70
  - Satellite fallback: 3,000 × $0.002 = $6
  - **Total: ~$76** (within $200 free credit)

### Unsplash
- **Vehicles/Boats (~3,000 items)**:
  - Free tier: 50 req/hour = 1,200/day
  - Time needed: ~3 days (running slowly to stay in free tier)
  - **Total: $0** (free)

### Total Initial Enrichment Cost
- **$0-76** (depending on using free credits)
- **Ongoing**: Minimal (only new auctions)

## Database Schema Update

The `imageUrl` field is already in the Auction table. The script updates it automatically:

```sql
UPDATE Auction 
SET imageUrl = 'https://maps.googleapis.com/maps/api/streetview?...'
WHERE id = 'auction-id-here'
```

## Monitoring

The script outputs progress:

```
🎨 Enriching images for 1000 auctions...
  ✓ Updated colb7ybjz... - Subasta de Local comercial en avenida roquetas de mar
  ✓ Updated abc123xyz... - Subasta de BMW Serie 3
  ✗ Error updating def456...: No coordinates available
  
✅ Successfully updated 856/1000 auction images
```

## Best Practices

1. **Start Small**: Test with 10-50 auctions first
   ```bash
   python scripts/enrich_images.py --batch-size 10
   ```

2. **Use Staging DB**: Test on copy first
   ```bash
   cp data/database/prod.db data/database/staging.db
   python scripts/enrich_images.py --db data/database/staging.db
   ```

3. **Monitor API Usage**: Check your API dashboards regularly

4. **Rate Limiting**: Script includes 0.1s delay between requests

5. **Backup Database**: Always backup before bulk updates
   ```bash
   cp data/database/prod.db data/database/prod.db.backup
   ```

## Troubleshooting

### "No API keys configured"
- Make sure environment variables are set
- Check `.env` file exists and is loaded

### "Street View not available"
- Normal for rural areas or new constructions
- Script automatically falls back to satellite view

### "Unsplash rate limit exceeded"
- Free tier: 50 requests/hour
- Wait 1 hour or upgrade to paid tier
- Run script with smaller `--batch-size`

### Images not updating
- Check database permissions
- Verify auction IDs exist
- Check console output for errors

## Future Enhancements

1. **Cadastre Integration**: Use Spanish Cadastre API for official property photos
2. **Cache System**: Store downloaded images locally
3. **Image Quality Check**: Verify image loads successfully
4. **Fallback Chain**: Multiple backup sources
5. **ML Classification**: Auto-categorize images by content
