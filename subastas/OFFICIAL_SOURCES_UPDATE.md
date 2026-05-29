# Official Sources Update - January 28, 2026

## Change Summary

Removed AlertaSubastas references from the auction cards to display only official government sources where auctions originate.

## What Was Changed

### 1. Source Display Mapping (AuctionCard.tsx)

**Removed**:
- ❌ `'AlertaSubastas': { label: 'Alerta Subastas', color: 'bg-purple-600' }`

**Now Shows Only Official Sources**:
- ✅ `'BOE': { label: 'BOE Oficial', color: 'bg-blue-600' }` - Boletín Oficial del Estado
- ✅ `'Subastas.boe.es': { label: 'Portal BOE', color: 'bg-blue-700' }` - Official BOE Portal
- ✅ `'TEJU': { label: 'Tablón Edictal', color: 'bg-indigo-600' }` - Official Edict Board
- ✅ `'Seguridad Social': { label: 'Seg. Social', color: 'bg-purple-600' }` - Social Security
- ✅ `'Procuradores': { label: 'Procuradores', color: 'bg-slate-600' }` - Court Attorneys Portal

### 2. Footer Metadata

**Removed**:
- ❌ "vía AlertaSubastas" small text at footer
- ❌ `originalSource` display logic

**Rationale**: AlertaSubastas is the scraper/aggregator tool, not the official source. Users should only see where the auction legally originates from (BOE, TEJU, etc.), not the technical mechanism used to fetch the data.

### 3. Image Enrichment Script

Updated documentation and help text to reference only official sources:
- Changed: `Filter by source (e.g., BOE, AlertaSubastas)`
- To: `Filter by official source (e.g., BOE, TEJU, Procuradores)`

## Database Analysis

Current database state:
```
Total auctions: 13,447
All have source: "BOE" (official source)
Some have originalSource: "AlertaSubastas" (scraper that fetched it)
```

The `originalSource` field is maintained in the database for internal tracking but is no longer displayed to users.

## Visual Result

**Before**:
- Source badge: "BOE Oficial"
- Footer: "vía AlertaSubastas" (showing scraper)

**After**:
- Source badge: "BOE Oficial"
- Footer: Only date (no scraper reference)

## Technical Details

### Source Badge Display Logic

```typescript
const getSourceDisplay = () => {
  const sourceMap: Record<string, { label: string; color: string }> = {
    'BOE': { label: 'BOE Oficial', color: 'bg-blue-600' },
    'Subastas.boe.es': { label: 'Portal BOE', color: 'bg-blue-700' },
    'TEJU': { label: 'Tablón Edictal', color: 'bg-indigo-600' },
    'Seguridad Social': { label: 'Seg. Social', color: 'bg-purple-600' },
    'Procuradores': { label: 'Procuradores', color: 'bg-slate-600' },
  };
  
  return sourceMap[item.source] || { label: item.source, color: 'bg-gray-600' };
};
```

### Data Model Clarification

- **`source`**: Official legal source (BOE, TEJU, Procuradores, etc.)
  - ✅ **Displayed to users** as branded badge
  - This is what users care about: "Where did this auction come from officially?"

- **`originalSource`**: Technical scraper/aggregator (AlertaSubastas, etc.)
  - ❌ **Not displayed to users**
  - Internal tracking only for data pipeline debugging
  - Kept in database but hidden from UI

## Files Modified

1. **`src/components/dashboard/AuctionCard.tsx`**
   - Updated source mapping (removed AlertaSubastas)
   - Removed footer originalSource display
   - Added official source mappings (TEJU, Procuradores, etc.)

2. **`scripts/enrich_images.py`**
   - Updated documentation to reference official sources only

## Future Official Sources

The source mapping is ready to handle additional official sources as they're added:

- **Provincial Tax Offices**: Gipuzkoa, Bizkaia, etc.
- **Seguridad Social**: Social security auctions
- **Tablón Edictal (TEJU)**: Pre-auction edicts
- **Court Procuradores**: Court attorney portals
- **Cadastre**: Official property registry auctions

All will be displayed with appropriate branding and colors.

## User Experience

Users now see only what matters to them:
- ✅ **Official source**: Where the auction legally comes from
- ✅ **Clear branding**: Blue for BOE, purple for Social Security, etc.
- ✅ **Trust indicators**: Government official sources only
- ❌ No technical implementation details (scrapers, aggregators)

## Status: COMPLETE ✅

All AlertaSubastas references removed from user-facing displays. Only official government auction sources are now shown on auction cards.
