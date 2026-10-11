import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Provider } from "react-redux";
import { store } from "./app/store";

import { OsuCoachApp } from "./app/OsuCoachApp";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { HashRouter } from "react-router-dom";
import { appTheme } from "./app/styles/theme";
import { TheaterProvider } from "./app/providers/TheaterProvider";
import { createAppTheater } from "./app/services/common/CommonManagers";
import { frontendAPI } from "./app/api";
import log from "electron-log";
import { resolveBuiltInSkinsFolder } from "./app/services/common/local/builtin-skins";
import { FlashlightOverlay } from "./app/screens/flashlight/FlashlightOverlay";

function renderFlashlightOverlay() {
  createRoot(document.getElementById("root") as HTMLElement).render(<FlashlightOverlay />);
}

(async function () {
  Object.assign(console, log.functions);

  if (window.location.hash.startsWith("#/fl-overlay")) {
    renderFlashlightOverlay();
    return;
  }

  const [appVersion, appPlatform, appResourcesPath] = await Promise.all([
    frontendAPI.getAppVersion(),
    frontendAPI.getPlatform(),
    frontendAPI.getPath("appResources"),
  ]);
  const builtInSkinsFolder = resolveBuiltInSkinsFolder(appResourcesPath);

  console.log(`Booting osu!coach with ${JSON.stringify({ appVersion, appPlatform, builtInSkinsFolder })}`);

  const theater = createAppTheater({
    appVersion,
    appPlatform,
    builtInSkinsFolder,
  });

  const container = document.getElementById("root") as HTMLElement;
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <Provider store={store}>
        <HashRouter>
          <ThemeProvider theme={appTheme}>
            <CssBaseline />
            <TheaterProvider theater={theater}>
              <OsuCoachApp />
            </TheaterProvider>
          </ThemeProvider>
        </HashRouter>
      </Provider>
    </StrictMode>,
  );
})();
