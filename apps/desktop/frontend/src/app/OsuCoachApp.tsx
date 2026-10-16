import { useAppDispatch } from "./hooks/redux";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { LeftMenuSidebar } from "./components/sidebar/LeftMenuSidebar";
import { SplashScreen } from "./screens/splash/SplashScreen";
import { HomeScreen } from "./screens/home/HomeScreen";
import { Box, Divider, Stack, Tab, Tabs } from "@mui/material";
import {
  Brush,
  CleaningServices,
  CollectionsBookmark,
  ContentCut,
  FlashlightOn,
  GpsFixed,
  QueueMusic,
  Speed,
} from "@mui/icons-material";
import { FaMicroscope } from "react-icons/fa";
import { SpeedChanger } from "./screens/speed-changer/SpeedChanger";
import { MapPractice } from "./screens/map-practice/MapPractice";
import { useTranslation } from "./i18n";
import { UpdateModal } from "./components/update/UpdateModal";
import { ReactNode, useEffect, useRef } from "react";
import { useAnalysisApp } from "./providers/TheaterProvider";
import { downloadFinished, downloadProgressed, newVersionAvailable } from "./store/update/slice";
import { frontendAPI } from "./api";
import { ipcRenderer } from "electron";
import { useTheaterContext } from "./providers/TheaterProvider";
import { ELECTRON_UPDATE_FLAG } from "./utils/constants";
import { Analyzer } from "./screens/analyzer/Analyzer";
import { SetupScreen } from "./screens/setup/SetupScreen";
import { SettingsModalProvider } from "./providers/SettingsProvider";
import { CollectionManagerScreen } from "./screens/collections/CollectionManagerScreen";
import { MapCleaner } from "./screens/map-cleaner/MapCleaner";
import { AimTrainer } from "./screens/trainer/AimTrainer";
import { SkinManager } from "./screens/skins/SkinManager";
import { FlashlightScreen } from "./screens/flashlight/FlashlightScreen";
import { SongsCompilation } from "./screens/songs-compilation/SongsCompilation";

function TopMenu() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const value = location.pathname.includes("speed-changer")
    ? "speed-changer"
    : location.pathname.includes("practice")
    ? "practice"
    : location.pathname.includes("collections")
    ? "collections"
    : location.pathname.includes("cleaner")
    ? "cleaner"
    : location.pathname.includes("trainer")
    ? "trainer"
    : location.pathname.includes("skins")
    ? "skins"
    : location.pathname.includes("flashlight")
    ? "flashlight"
    : location.pathname.includes("compilation")
    ? "compilation"
    : location.pathname.includes("analyzer")
    ? "analyzer"
    : false;
  const tabSx = { textTransform: "none", fontWeight: 700, minHeight: 52, fontSize: "0.95rem", gap: 1 };
  return (
    <Tabs
      value={value}
      onChange={(_, v) => navigate(`/app/${v}`)}
      variant={"scrollable"}
      scrollButtons={"auto"}
      sx={{
        px: 2,
        minHeight: 52,
        borderBottom: 1,
        borderColor: "divider",
        "& .MuiTabs-indicator": { backgroundColor: "#ff66aa", height: 3 },
        "& .MuiTab-root.Mui-selected": { color: "#ff66aa" },
      }}
    >
      <Tab
        value={"analyzer"}
        icon={<FaMicroscope />}
        iconPosition={"start"}
        label={t("nav.reviewer")}
        onFocus={(e: React.FocusEvent<HTMLElement>) => e.currentTarget.blur()}
        sx={tabSx}
      />
      <Tab
        value={"speed-changer"}
        icon={<Speed />}
        iconPosition={"start"}
        label={t("nav.speedChanger")}
        onFocus={(e: React.FocusEvent<HTMLElement>) => e.currentTarget.blur()}
        sx={tabSx}
      />
      <Tab
        value={"practice"}
        icon={<ContentCut />}
        iconPosition={"start"}
        label={t("nav.practice")}
        onFocus={(e: React.FocusEvent<HTMLElement>) => e.currentTarget.blur()}
        sx={tabSx}
      />
      <Tab
        value={"collections"}
        icon={<CollectionsBookmark />}
        iconPosition={"start"}
        label={t("nav.collections")}
        onFocus={(e: React.FocusEvent<HTMLElement>) => e.currentTarget.blur()}
        sx={tabSx}
      />
      <Tab
        value={"cleaner"}
        icon={<CleaningServices />}
        iconPosition={"start"}
        label={t("nav.cleaner")}
        onFocus={(e: React.FocusEvent<HTMLElement>) => e.currentTarget.blur()}
        sx={tabSx}
      />
      <Tab
        value={"trainer"}
        icon={<GpsFixed />}
        iconPosition={"start"}
        label={t("nav.trainer")}
        onFocus={(e: React.FocusEvent<HTMLElement>) => e.currentTarget.blur()}
        sx={tabSx}
      />
      <Tab
        value={"skins"}
        icon={<Brush />}
        iconPosition={"start"}
        label={t("nav.skins")}
        onFocus={(e: React.FocusEvent<HTMLElement>) => e.currentTarget.blur()}
        sx={tabSx}
      />
      <Tab
        value={"flashlight"}
        icon={<FlashlightOn />}
        iconPosition={"start"}
        label={t("nav.flashlight")}
        onFocus={(e: React.FocusEvent<HTMLElement>) => e.currentTarget.blur()}
        sx={tabSx}
      />
      <Tab
        value={"compilation"}
        icon={<QueueMusic />}
        iconPosition={"start"}
        label={t("nav.compilation")}
        onFocus={(e: React.FocusEvent<HTMLElement>) => e.currentTarget.blur()}
        sx={tabSx}
      />
    </Tabs>
  );
}

// Tabs are kept mounted while hidden so each screen's state survives switching tabs.
// Exceptions mount only while active: the Analyzer and Map Practice share the single
// PIXI renderer / scenario singleton (keeping both alive would fight over it), and the
// Analyzer's replay persists through the services anyway.
const TAB_ORDER = [
  "analyzer",
  "speed-changer",
  "practice",
  "collections",
  "cleaner",
  "trainer",
  "skins",
  "flashlight",
  "compilation",
  "home",
] as const;
type TabKey = (typeof TAB_ORDER)[number];
const ACTIVE_ONLY = new Set<TabKey>(["analyzer", "practice", "home"]);

function activeTab(pathname: string): TabKey {
  return TAB_ORDER.find((k) => pathname.includes(k)) ?? "analyzer";
}

const SCREENS: Record<TabKey, ReactNode> = {
  analyzer: <Analyzer />,
  "speed-changer": <SpeedChanger />,
  practice: <MapPractice />,
  collections: <CollectionManagerScreen />,
  cleaner: <MapCleaner />,
  trainer: <AimTrainer />,
  skins: <SkinManager />,
  flashlight: <FlashlightScreen />,
  compilation: <SongsCompilation />,
  home: <HomeScreen />,
};

function KeepAliveOutlet() {
  const location = useLocation();
  const analyzer = useAnalysisApp();
  const active = activeTab(location.pathname);
  const visited = useRef<Set<TabKey>>(new Set());
  visited.current.add(active);

  // Stop any playback when leaving a tab so audio never keeps going in the background.
  useEffect(() => {
    analyzer.gameClock.pause();
  }, [active, analyzer]);

  return (
    <>
      {TAB_ORDER.map((key) => {
        const isActive = key === active;
        if (ACTIVE_ONLY.has(key)) {
          return isActive ? (
            <Box key={key} sx={{ height: "100%" }}>
              {SCREENS[key]}
            </Box>
          ) : null;
        }
        if (!visited.current.has(key)) return null;
        return (
          <Box key={key} sx={{ height: "100%", display: isActive ? "block" : "none" }}>
            {SCREENS[key]}
          </Box>
        );
      })}
    </>
  );
}

function NormalView() {
  return (
    <SettingsModalProvider>
      <Stack direction={"row"} sx={{ height: "100vh" }}>
        <LeftMenuSidebar />
        <Divider orientation={"vertical"} />
        <Stack sx={{ flexGrow: 1, height: "100%", minWidth: 0 }}>
          <TopMenu />
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <KeepAliveOutlet />
          </Box>
        </Stack>
        <UpdateModal />
      </Stack>
    </SettingsModalProvider>
  );
}

export function OsuCoachApp() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const theater = useTheaterContext();

  useEffect(() => {
    void theater.common.initialize();

    ipcRenderer.on("onManualReplayOpen", (event, file) => {
      navigate("/app/analyzer");
      void theater.analyzer.loadReplay(file);
    });

    (async function () {
      if (!(await theater.analyzer.osuFolderService.autoDetectOsuFolder())) {
        console.log("osu! folder was not set, redirecting to the setup screen.");
        navigate("/setup");
      } else {
        console.log(`osu! folder = ${theater.analyzer.osuFolderService.getOsuFolder()}`);
        console.log(`osu!/Songs folder = ${theater.analyzer.osuFolderService.songsFolder$.getValue()}`);
        console.log(`osu!/Replays folder = ${theater.analyzer.osuFolderService.replaysFolder$.getValue()}`);
        navigate("/app/analyzer");
      }
    })();

    if (ELECTRON_UPDATE_FLAG) {
      frontendAPI.onUpdateAvailable((version) => {
        dispatch(newVersionAvailable(version));
      });
      frontendAPI.onDownloadFinished(() => {
        dispatch(downloadFinished());
      });
      frontendAPI.onUpdateDownloadProgress((updateInfo) => {
        const { total, bytesPerSecond, transferred } = updateInfo;
        dispatch(downloadProgressed({ downloadedBytes: transferred, totalBytes: total, bytesPerSecond }));
      });
      frontendAPI.checkForUpdate();
    }
  }, []);

  return (
    <Routes>
      <Route index element={<SplashScreen />} />
      <Route path={"setup"} element={<SetupScreen />} />
      <Route path={"app/*"} element={<NormalView />} />
    </Routes>
  );
}
