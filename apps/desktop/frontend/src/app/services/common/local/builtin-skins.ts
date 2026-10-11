import { existsSync } from "fs";
import { join } from "path";

export function resolveBuiltInSkinsFolder(appResourcesPath: string): string {
  const packagedSkins = join(appResourcesPath, "Skins");
  const projectSkins = join(process.cwd(), "resources", "Skins");
  return !existsSync(packagedSkins) && existsSync(projectSkins) ? projectSkins : packagedSkins;
}
