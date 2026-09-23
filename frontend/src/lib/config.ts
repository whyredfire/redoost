type Config = { sitesOrigin: string | null };

// Loaded at runtime so the same build works on any domain
async function loadConfig(): Promise<Config> {
  try {
    const response = await fetch("/config.json");
    if (response.ok) {
      const config: Config = await response.json();
      return config;
    }
  } catch {
    // Sites are shown by slug instead of as links
  }
  return { sitesOrigin: null };
}

export const config = await loadConfig();
