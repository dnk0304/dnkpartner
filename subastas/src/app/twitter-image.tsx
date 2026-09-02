/**
 * Twitter card image for `/` — identical render to the OG image, re-exported
 * so Next emits both `og:image` and `twitter:image` (the page keeps its
 * `summary_large_image` card). One template, two meta tags.
 */
export { default, runtime, revalidate, alt, size, contentType } from './opengraph-image';
