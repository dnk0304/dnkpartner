import { Sparkles } from "lucide-react"

export function HeroBanner() {
  return (
    <div 
      className="relative overflow-hidden rounded-xl p-8 mb-6 glass animate-fade-in-up"
      style={{
        background: "var(--gradient-hero-soft)",
      }}
    >
      {/* Animated gradient overlay */}
      <div 
        className="absolute inset-0 opacity-40 animate-gradient"
        style={{
          background: "var(--gradient-warm)",
          backgroundSize: "200% 200%",
        }}
      />
      
      {/* Content */}
      <div className="relative z-10 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-white animate-pulse" />
          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
            LET YOUR IMAGINATION RUN FREE
          </h2>
          <Sparkles className="w-5 h-5 text-white animate-pulse" style={{ animationDelay: "0.5s" }} />
        </div>
        <p className="text-sm md:text-base text-white/80 font-medium">
          CONTENT CREATION ON STEROIDS
        </p>
      </div>

      {/* Decorative elements */}
      <div className="absolute top-0 left-0 w-32 h-32 bg-white/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-0 w-40 h-40 bg-white/5 rounded-full blur-3xl" />
    </div>
  )
}

