export default function LookupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: "#f9fafb", minHeight: "100vh", colorScheme: "light" }}>
      {children}
    </div>
  )
}
