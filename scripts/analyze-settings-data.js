// Script to fetch and analyze the Settings table data
const settingsUrl = "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Setting-Xxd5wa43tFv6dkkFZ6rYT4dFGY2Biq.csv"

async function analyzeSettingsData() {
  try {
    console.log("[v0] Fetching Settings data...")
    const response = await fetch(settingsUrl)
    const csvText = await response.text()

    console.log("[v0] Settings CSV content:")
    console.log(csvText)

    // Parse CSV manually for analysis
    const lines = csvText.trim().split("\n")
    const headers = lines[0].split(",")

    console.log("[v0] Headers:", headers)
    console.log("[v0] Number of settings:", lines.length - 1)

    // Parse each setting
    const settings = []
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",")
      const setting = {}
      headers.forEach((header, index) => {
        setting[header] = values[index]
      })
      settings.push(setting)
    }

    console.log("[v0] Parsed settings:")
    settings.forEach((setting) => {
      console.log(`- ${setting.key}: ${setting.value} (${setting.category})`)
    })

    return settings
  } catch (error) {
    console.error("[v0] Error fetching settings:", error)
  }
}

analyzeSettingsData()
