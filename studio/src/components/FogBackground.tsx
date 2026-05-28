export function FogBackground() {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-0"
      style={{
        background: `
          radial-gradient(ellipse 80% 50% at 20% 30%, rgba(124, 58, 237, 0.25) 0%, transparent 50%),
          radial-gradient(ellipse 60% 40% at 80% 20%, rgba(147, 51, 234, 0.2) 0%, transparent 45%),
          radial-gradient(ellipse 70% 60% at 70% 70%, rgba(234, 88, 12, 0.18) 0%, transparent 50%),
          radial-gradient(ellipse 50% 50% at 30% 80%, rgba(249, 115, 22, 0.15) 0%, transparent 45%),
          radial-gradient(ellipse 90% 70% at 50% 50%, rgba(168, 85, 247, 0.12) 0%, transparent 60%),
          radial-gradient(ellipse 40% 30% at 85% 85%, rgba(217, 119, 6, 0.2) 0%, transparent 40%),
          linear-gradient(135deg, #0c0c14 0%, #0d0d15 50%, #0e0c12 100%)
        `,
      }}
    />
  )
}
