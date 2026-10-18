import { homedir } from "node:os";
import { join, posix, win32 } from "node:path";

function pathForPlatform(platform: string) {
  return platform === "win32" ? win32 : posix;
}

// `os.homedir()` honors $HOME on Node but ignores it on Bun; resolving from env
// first keeps sandboxed (and engine-agnostic) behavior consistent.
function defaultHome(platform: string, env: NodeJS.ProcessEnv): string {
  if (platform === "win32") return env.USERPROFILE || homedir();
  return env.HOME || homedir();
}

export function getDefaultProfileDirectory(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home = defaultHome(platform, env)
): string {
  const pathApi = pathForPlatform(platform);
  if (platform === "win32") {
    const base = env.APPDATA || env.LOCALAPPDATA || pathApi.join(home, "AppData", "Roaming");
    return pathApi.join(base, "NitanMCP");
  }

  if (platform === "darwin") {
    return pathApi.join(home, "Library", "Application Support", "NitanMCP");
  }

  const base = env.XDG_CONFIG_HOME || pathApi.join(home, ".config");
  return pathApi.join(base, "nitan-mcp");
}

export function getDefaultProfilePath(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home = defaultHome(platform, env)
): string {
  return pathForPlatform(platform).join(getDefaultProfileDirectory(platform, env, home), "profile.json");
}
