import Image from 'next/image';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col items-center justify-center p-8">
      <Image
        src="/brand/dnk-partner-logo.png"
        alt="DNK Partner"
        width={600}
        height={200}
        priority
        className="h-auto w-full max-w-md mb-8"
      />
      <h1 className="text-2xl font-semibold text-center text-balance max-w-2xl">
        DNK Partner — Where effective solutions are gathered. Sales services, effectivity, creativity and product solutions — All at one place.
      </h1>
      <p className="mt-8 text-sm text-slate-500">Landing scaffold. Pixel builds the real UI in Phase 2.</p>
      <Link href="/auth/login" className="mt-6 px-4 py-2 bg-slate-900 text-white rounded-lg">Sign in</Link>
    </div>
  );
}
