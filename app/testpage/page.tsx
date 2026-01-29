export default function TestPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">Test Page Working! 🎉</h1>
        <p className="text-muted-foreground">
          If you can see this, deployments are working correctly.
        </p>
        <p className="text-sm text-muted-foreground">
          Timestamp: {new Date().toISOString()}
        </p>
        <div className="mt-8 p-4 border border-green-500 rounded-lg bg-green-50">
          <p className="text-green-800 font-semibold">✓ Updated Successfully!</p>
          <p className="text-green-700 text-sm">This box was added to test deployment sync.</p>
        </div>
      </div>
    </div>
  )
}
