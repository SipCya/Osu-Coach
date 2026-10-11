import { join } from "path";
import { format } from "url";
import { environment } from "../environments/environment";

const DEV_PORT = 4200;

export function isDevelopmentMode() {
  if (process.env.ELECTRON_IS_DEV) return true;
  return !environment.production;
}

export function frontendUrl(hash = "") {
  if (isDevelopmentMode()) return `http://localhost:${DEV_PORT}/${hash ? `#${hash}` : ""}`;
  return format({
    pathname: join(__dirname, "frontend", "index.html"),
    protocol: "file:",
    slashes: true,
    hash,
  });
}
