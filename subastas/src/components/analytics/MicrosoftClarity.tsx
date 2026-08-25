import Script from "next/script";

/**
 * Microsoft Clarity — session recordings + heatmaps (project id y7w11xgqyz).
 *
 * Injected site-wide from the root layout via next/script with
 * strategy="afterInteractive" (Next's idiomatic third-party analytics
 * pattern): the tag loads after the page is interactive so it never blocks
 * hydration or first paint. Because the snippet is emitted as an inline
 * <script>, it also does not participate in SSR/hydration diffing.
 *
 * No CSP in production (see src/middleware.ts — the CSP header is dev-only),
 * so www.clarity.ms loads unrestricted. The dev CSP already allows
 * *.clarity.ms for local parity.
 */
const CLARITY_PROJECT_ID = "y7w11xgqyz";

export function MicrosoftClarity() {
  return (
    <Script id="ms-clarity" strategy="afterInteractive">
      {`(function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");`}
    </Script>
  );
}
