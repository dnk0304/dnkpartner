/**
 * Free Captcha Solver
 * Uses detection, evasion, and automated solving techniques (no paid service required)
 */

import { Page } from 'puppeteer';

interface CaptchaSolution {
  success: boolean;
  method?: string;
  error?: string;
}

export class CaptchaSolver {
  /**
   * Detect if a captcha is present on the page
   */
  async detectCaptcha(page: Page): Promise<{
    hasRecaptcha: boolean;
    hasHCaptcha: boolean;
    hasCloudflare: boolean;
    hasGeneric: boolean;
    hasEtsyBlock: boolean;
    hasAccessDenied: boolean;
  }> {
    try {
      const detection = await page.evaluate(() => {
        // Check for reCAPTCHA
        const hasRecaptcha = !!(
          document.querySelector('.g-recaptcha') ||
          document.querySelector('[data-sitekey]') ||
          document.querySelector('iframe[src*="google.com/recaptcha"]') ||
          (window as any).grecaptcha
        );

        // Check for hCaptcha
        const hasHCaptcha = !!(
          document.querySelector('.h-captcha') ||
          document.querySelector('iframe[src*="hcaptcha.com"]') ||
          (window as any).hcaptcha
        );

        // Check for Cloudflare challenge
        const hasCloudflare = !!(
          document.querySelector('#challenge-form') ||
          document.querySelector('.cf-browser-verification') ||
          document.title.includes('Just a moment') ||
          document.body?.textContent?.includes('Checking your browser')
        );

        // Check for generic captcha patterns
        const hasGeneric = !!(
          document.querySelector('[class*="captcha"]') ||
          document.querySelector('[id*="captcha"]') ||
          document.querySelector('img[src*="captcha"]')
        );

        // Check for Etsy-specific blocks
        const hasEtsyBlock = !!(
          document.title.includes('Access Denied') ||
          document.body?.textContent?.includes('Access to this page has been denied') ||
          document.body?.textContent?.includes('Please verify you are a human') ||
          document.querySelector('[data-error-type]') ||
          document.body?.textContent?.includes('unusual traffic') ||
          document.body?.textContent?.includes('Pardon Our Interruption')
        );

        // Check for generic access denied pages
        const hasAccessDenied = !!(
          document.title.toLowerCase().includes('access denied') ||
          document.title.toLowerCase().includes('blocked') ||
          document.title.toLowerCase().includes('forbidden') ||
          document.body?.textContent?.includes('403') ||
          document.body?.textContent?.includes('Access Denied') ||
          document.body?.textContent?.includes('blocked') ||
          document.body?.textContent?.includes('Too Many Requests') ||
          document.body?.textContent?.includes('Rate limit')
        );

        return {
          hasRecaptcha,
          hasHCaptcha,
          hasCloudflare,
          hasGeneric,
          hasEtsyBlock,
          hasAccessDenied
        };
      });

      return detection;
    } catch (error: any) {
      console.error('[CaptchaSolver] Detection error:', error.message);
      return {
        hasRecaptcha: false,
        hasHCaptcha: false,
        hasCloudflare: false,
        hasGeneric: false,
        hasEtsyBlock: false,
        hasAccessDenied: false
      };
    }
  }

  /**
   * Attempt to solve Cloudflare challenge (wait for automatic resolution)
   */
  async solveCloudflare(page: Page, maxWaitMs: number = 30000): Promise<CaptchaSolution> {
    console.log('[CaptchaSolver] Cloudflare challenge detected, waiting for resolution...');
    
    try {
      const startTime = Date.now();
      
      // Wait for Cloudflare to resolve (usually automatic with good stealth)
      await page.waitForFunction(
        () => {
          const cfChallenge = document.querySelector('#challenge-form') ||
                            document.querySelector('.cf-browser-verification');
          return !cfChallenge;
        },
        { timeout: maxWaitMs }
      );

      const elapsed = Date.now() - startTime;
      console.log(`[CaptchaSolver] Cloudflare resolved in ${elapsed}ms`);
      
      return { success: true, method: 'cloudflare-auto' };
    } catch (error: any) {
      console.error('[CaptchaSolver] Cloudflare timeout:', error.message);
      return { success: false, error: 'Cloudflare challenge timeout' };
    }
  }

  /**
   * Attempt to bypass reCAPTCHA using stealth techniques
   */
  async bypassRecaptcha(page: Page): Promise<CaptchaSolution> {
    console.log('[CaptchaSolver] Attempting reCAPTCHA bypass...');
    
    try {
      // Method 1: Try to submit form without solving (sometimes works with good stealth)
      await page.evaluate(() => {
        const forms = document.querySelectorAll('form');
        forms.forEach(form => {
          const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
          if (submitBtn) {
            (submitBtn as HTMLElement).click();
          }
        });
      });

      // Wait a bit to see if submission succeeded
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if still on captcha page
      const stillHasCaptcha = await page.evaluate(() => {
        return !!(
          document.querySelector('.g-recaptcha') ||
          document.querySelector('iframe[src*="google.com/recaptcha"]')
        );
      });

      if (!stillHasCaptcha) {
        console.log('[CaptchaSolver] reCAPTCHA bypassed via form submission');
        return { success: true, method: 'recaptcha-bypass' };
      }

      // Method 2: Try clicking the checkbox (for v2)
      const checkboxClicked = await page.evaluate(() => {
        const checkbox = document.querySelector('.recaptcha-checkbox-border');
        if (checkbox) {
          (checkbox as HTMLElement).click();
          return true;
        }
        return false;
      });

      if (checkboxClicked) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        console.log('[CaptchaSolver] reCAPTCHA checkbox clicked');
        return { success: true, method: 'recaptcha-checkbox' };
      }

      return { success: false, error: 'reCAPTCHA requires manual solving or paid service' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Attempt to bypass hCaptcha
   */
  async bypassHCaptcha(page: Page): Promise<CaptchaSolution> {
    console.log('[CaptchaSolver] Attempting hCaptcha bypass...');
    
    try {
      // Similar approach to reCAPTCHA
      await page.evaluate(() => {
        const forms = document.querySelectorAll('form');
        forms.forEach(form => {
          const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
          if (submitBtn) {
            (submitBtn as HTMLElement).click();
          }
        });
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      const stillHasCaptcha = await page.evaluate(() => {
        return !!document.querySelector('iframe[src*="hcaptcha.com"]');
      });

      if (!stillHasCaptcha) {
        console.log('[CaptchaSolver] hCaptcha bypassed');
        return { success: true, method: 'hcaptcha-bypass' };
      }

      return { success: false, error: 'hCaptcha requires manual solving or paid service' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle Etsy-specific or access denied blocks
   * These usually require waiting, refreshing, or using a different proxy
   */
  async handleAccessBlock(page: Page): Promise<CaptchaSolution> {
    console.log('[CaptchaSolver] Access block detected, attempting recovery...');
    
    try {
      // Wait a bit - sometimes blocks are temporary
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Try refreshing the page
      await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
      
      // Check if still blocked
      const stillBlocked = await page.evaluate(() => {
        return document.title.toLowerCase().includes('access denied') ||
               document.body?.textContent?.includes('Access Denied') ||
               document.body?.textContent?.includes('unusual traffic') ||
               document.body?.textContent?.includes('Pardon Our Interruption') ||
               document.body?.textContent?.includes('Too Many Requests');
      });
      
      if (!stillBlocked) {
        console.log('[CaptchaSolver] Access block cleared after refresh');
        return { success: true, method: 'refresh' };
      }
      
      console.log('[CaptchaSolver] Still blocked - may need proxy rotation');
      return { 
        success: false, 
        error: 'Access denied - requires proxy rotation or waiting period' 
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Main solving method - detects and attempts to solve any captcha
   */
  async solve(page: Page, maxRetries: number = 3): Promise<CaptchaSolution> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      console.log(`[CaptchaSolver] Solve attempt ${attempt + 1}/${maxRetries}`);
      
      const detection = await this.detectCaptcha(page);

      // No captcha detected
      if (!detection.hasRecaptcha && !detection.hasHCaptcha && 
          !detection.hasCloudflare && !detection.hasGeneric &&
          !detection.hasEtsyBlock && !detection.hasAccessDenied) {
        return { success: true, method: 'no-captcha' };
      }

      // Handle Cloudflare
      if (detection.hasCloudflare) {
        const result = await this.solveCloudflare(page);
        if (result.success) return result;
      }

      // Handle Etsy-specific blocks and access denied pages
      if (detection.hasEtsyBlock || detection.hasAccessDenied) {
        const result = await this.handleAccessBlock(page);
        if (result.success) return result;
      }

      // Handle reCAPTCHA
      if (detection.hasRecaptcha) {
        const result = await this.bypassRecaptcha(page);
        if (result.success) return result;
      }

      // Handle hCaptcha
      if (detection.hasHCaptcha) {
        const result = await this.bypassHCaptcha(page);
        if (result.success) return result;
      }

      // Generic captcha - just wait and retry
      if (detection.hasGeneric) {
        console.log('[CaptchaSolver] Generic captcha detected, waiting...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      // Wait before retry
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    return { 
      success: false, 
      error: 'Failed to solve captcha after multiple attempts. Consider using stealth mode or proxy rotation.' 
    };
  }

  /**
   * Check if page has been blocked or needs captcha solving
   */
  async needsSolving(page: Page): Promise<boolean> {
    const detection = await this.detectCaptcha(page);
    return detection.hasRecaptcha || detection.hasHCaptcha || 
           detection.hasCloudflare || detection.hasGeneric ||
           detection.hasEtsyBlock || detection.hasAccessDenied;
  }
}

export const captchaSolver = new CaptchaSolver();
