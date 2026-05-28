/**
 * Data Validator
 * Validates and sanitizes scraped data based on configurable schemas
 * Ensures data quality and consistency
 */

export interface ValidationSchema {
  required: string[];             // Required fields
  types: Record<string, 'string' | 'number' | 'boolean' | 'array' | 'object' | 'date'>;
  ranges?: Record<string, { min?: number; max?: number }>;
  patterns?: Record<string, RegExp>;
  custom?: Record<string, (value: any) => boolean>;
  allowNull?: string[];          // Fields that can be null
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sanitized?: any;
}

export interface BatchValidationResult {
  totalItems: number;
  validItems: number;
  invalidItems: number;
  results: ValidationResult[];
  sanitizedData: any[];
}

export class DataValidator {
  /**
   * Validate a single item against a schema
   */
  validate<T extends Record<string, any>>(
    item: T,
    schema: ValidationSchema
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[];
    warnings = [];

    // Check required fields
    for (const field of schema.required) {
      if (!(field in item) || item[field] === undefined) {
        const isNullAllowed = schema.allowNull?.includes(field);
        if (item[field] === null && isNullAllowed) {
          continue;
        }
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Check types
    for (const [field, expectedType] of Object.entries(schema.types)) {
      if (!(field in item)) continue;
      
      const value = item[field];
      const actualType = this.getType(value);

      if (actualType !== expectedType) {
        // Allow null if specified
        if (value === null && schema.allowNull?.includes(field)) {
          continue;
        }
        errors.push(`Invalid type for field '${field}': expected ${expectedType}, got ${actualType}`);
      }
    }

    // Check ranges (for numbers)
    if (schema.ranges) {
      for (const [field, range] of Object.entries(schema.ranges)) {
        if (!(field in item)) continue;
        
        const value = item[field];
        if (typeof value !== 'number') continue;

        if (range.min !== undefined && value < range.min) {
          errors.push(`Field '${field}' value ${value} is below minimum ${range.min}`);
        }
        if (range.max !== undefined && value > range.max) {
          errors.push(`Field '${field}' value ${value} exceeds maximum ${range.max}`);
        }
      }
    }

    // Check patterns (for strings)
    if (schema.patterns) {
      for (const [field, pattern] of Object.entries(schema.patterns)) {
        if (!(field in item)) continue;
        
        const value = item[field];
        if (typeof value !== 'string') continue;

        if (!pattern.test(value)) {
          errors.push(`Field '${field}' does not match required pattern`);
        }
      }
    }

    // Run custom validators
    if (schema.custom) {
      for (const [field, validator] of Object.entries(schema.custom)) {
        if (!(field in item)) continue;
        
        try {
          if (!validator(item[field])) {
            errors.push(`Field '${field}' failed custom validation`);
          }
        } catch (error: any) {
          warnings.push(`Custom validator for '${field}' threw error: ${error.message}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate a batch of items
   */
  validateBatch<T extends Record<string, any>>(
    items: T[],
    schema: ValidationSchema
  ): BatchValidationResult {
    const results: ValidationResult[] = [];
    const sanitizedData: T[] = [];

    for (const item of items) {
      const result = this.validate(item, schema);
      results.push(result);

      if (result.valid) {
        const sanitized = this.sanitize(item, schema);
        sanitizedData.push(sanitized);
      }
    }

    const validItems = results.filter(r => r.valid).length;
    const invalidItems = results.filter(r => !r.valid).length;

    console.log(`[DataValidator] Validated ${items.length} items: ${validItems} valid, ${invalidItems} invalid`);

    return {
      totalItems: items.length,
      validItems,
      invalidItems,
      results,
      sanitizedData,
    };
  }

  /**
   * Sanitize an item (clean and normalize data)
   */
  sanitize<T extends Record<string, any>>(
    item: T,
    schema: ValidationSchema
  ): T {
    const sanitized: any = { ...item };

    for (const [field, type] of Object.entries(schema.types)) {
      if (!(field in sanitized)) continue;

      let value = sanitized[field];

      // Skip null values if allowed
      if (value === null && schema.allowNull?.includes(field)) {
        continue;
      }

      // Sanitize based on type
      switch (type) {
        case 'string':
          if (typeof value === 'string') {
            // Trim whitespace
            value = value.trim();
            // Remove control characters
            value = value.replace(/[\x00-\x1F\x7F]/g, '');
          }
          break;

        case 'number':
          if (typeof value === 'string') {
            // Try to parse string to number
            const parsed = parseFloat(value);
            if (!isNaN(parsed)) {
              value = parsed;
            }
          }
          // Apply range constraints
          if (typeof value === 'number' && schema.ranges?.[field]) {
            const range = schema.ranges[field];
            if (range.min !== undefined) {
              value = Math.max(value, range.min);
            }
            if (range.max !== undefined) {
              value = Math.min(value, range.max);
            }
          }
          break;

        case 'array':
          if (Array.isArray(value)) {
            // Remove duplicates and null/undefined values
            value = [...new Set(value.filter(v => v != null))];
          }
          break;

        case 'date':
          if (typeof value === 'string' || typeof value === 'number') {
            // Normalize to ISO string
            try {
              value = new Date(value).toISOString();
            } catch {
              // Keep original value if parsing fails
            }
          }
          break;
      }

      sanitized[field] = value;
    }

    return sanitized;
  }

  /**
   * Get the type of a value
   */
  private getType(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    if (value instanceof Date) return 'date';
    return typeof value;
  }

  /**
   * Create a validation schema for common trend data
   */
  static createTrendSchema(): ValidationSchema {
    return {
      required: ['query', 'category', 'popularityScore'],
      types: {
        query: 'string',
        category: 'string',
        popularityScore: 'number',
        listingCount: 'number',
        averagePrice: 'number',
        firstDetected: 'date',
        lastUpdated: 'date',
        topListings: 'array',
      },
      ranges: {
        popularityScore: { min: 0, max: 100 },
        listingCount: { min: 0 },
        averagePrice: { min: 0 },
      },
      patterns: {
        query: /.+/, // Non-empty string
        category: /.+/,
      },
      allowNull: ['averagePrice', 'topListings'],
    };
  }

  /**
   * Create a validation schema for product data
   */
  static createProductSchema(): ValidationSchema {
    return {
      required: ['id', 'title', 'price'],
      types: {
        id: 'string',
        title: 'string',
        price: 'number',
        currency: 'string',
        rating: 'number',
        reviewCount: 'number',
        url: 'string',
        imageUrl: 'string',
      },
      ranges: {
        price: { min: 0 },
        rating: { min: 0, max: 5 },
        reviewCount: { min: 0 },
      },
      patterns: {
        id: /^[a-zA-Z0-9_-]+$/,
        url: /^https?:\/\/.+/,
      },
      allowNull: ['rating', 'reviewCount', 'imageUrl'],
    };
  }
}

// Export singleton instance
export const dataValidator = new DataValidator();
