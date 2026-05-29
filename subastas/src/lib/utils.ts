import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Properly capitalize province/city names
 * Handles special cases like "A Coruña", "La Rioja", "Santa Cruz de Tenerife"
 */
export function capitalizeLocation(name: string): string {
  if (!name) return name;
  
  // Words that should stay lowercase (Spanish prepositions/articles in place names)
  const lowercaseWords = ['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e'];
  
  return name
    .split(' ')
    .map((word, index) => {
      const lowerWord = word.toLowerCase();
      // First word is always capitalized, others only if not a preposition/article
      if (index === 0 || !lowercaseWords.includes(lowerWord)) {
        return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1);
      }
      return lowerWord;
    })
    .join(' ');
}
