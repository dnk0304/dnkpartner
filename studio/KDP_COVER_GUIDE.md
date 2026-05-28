# KDP Cover Dimensions - Quick Reference

## Common Issues and Solutions

### Issue: "Your expected cover size is X but the submitted file size is Y"

**Root Cause**: Incorrect page count or missing spine width calculation.

**Solution**:
1. **Verify your page count is set correctly** in the Book Setup step
2. **Ensure page count is at least 24** (KDP minimum for paperback)
3. **Use the correct paper type**:
   - Black & White books: "White Paper" or "Cream Paper"
   - Color books: "Standard Color Paper" or "Premium Color Paper"

### Official KDP Specifications

#### Bleed
- **Standard**: 0.125" (3.2mm) on all sides
- **Required**: Yes (for covers)

#### Minimum Page Count
- **Paperback**: 24 pages minimum
- **Maximum**: 828 pages

#### Paper Calipers (thickness per sheet)
- **White Paper (B&W)**: 0.002252"
- **Cream Paper (B&W)**: 0.0025"
- **Standard Color**: 0.002252"
- **Premium Color**: 0.002347"

### Cover Dimension Formula

```
Total Width = Bleed + Back Cover + Spine + Front Cover + Bleed
Total Height = Bleed + Trim Height + Bleed

Where:
- Bleed = 0.125"
- Back Cover = Front Cover = Trim Width
- Spine = Page Count × Paper Caliper
```

### Example Calculations (8" × 10" book)

| Pages | Paper Type      | Spine Width | Total Width | Total Height |
|-------|-----------------|-------------|-------------|--------------|
| 24    | Standard Color  | 0.054"      | 16.304"     | 10.250"      |
| 50    | Standard Color  | 0.113"      | 16.363"     | 10.250"      |
| 76    | Standard Color  | 0.171"      | 16.421"     | 10.250"      |
| 100   | Standard Color  | 0.225"      | 16.475"     | 10.250"      |
| 200   | Standard Color  | 0.450"      | 16.700"     | 10.250"      |

### Using KDP's Cover Calculator

For precise dimensions, always use KDP's official tool:
1. Go to: https://kdp.amazon.com/cover-calculator
2. Enter your book details:
   - Binding Type: Paperback
   - Interior Type: (Black & White / Color)
   - Paper Type: (White / Cream / Standard / Premium)
   - Trim Size: (e.g., 8 x 10)
   - Page Count: (your actual page count)
3. Download the provided template

### In This Application

The app automatically:
- ✅ Sets default page count to 24 (KDP minimum)
- ✅ Calculates spine width using official KDP formulas
- ✅ Warns you if page count is invalid
- ✅ Uses correct paper calipers for each type
- ✅ Adds proper bleed (0.125") to all covers

### Troubleshooting

**My cover dimensions don't match KDP's expectations:**
1. Check the "Cover Editor" panel - it shows the exact dimensions
2. Verify your page count in the Book Setup step
3. Ensure you've selected the correct paper type
4. If you see a red warning, your page count is below the minimum

**I changed my page count but dimensions didn't update:**
1. Go back to the Book Setup step
2. Update the page count there
3. Return to the Cover step - dimensions will recalculate

**KDP rejected my cover:**
1. Check the exact dimensions KDP expects (in the error message)
2. Use those to calculate required pages: `(ExpectedWidth - 16.25) / 0.002252`
3. Update your page count accordingly
4. Re-download the cover PDF

### Resources

- [KDP Cover Calculator](https://kdp.amazon.com/cover-calculator)
- [KDP Cover Specifications](https://kdp.amazon.com/en_US/help/topic/G201953020)
- [KDP Print Options](https://kdp.amazon.com/en_US/help/topic/G202145400)

