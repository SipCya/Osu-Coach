import { useTranslation } from "../../i18n";
import { AppLogo } from "../logo/AppLogo";
import { Box, Button, Divider, IconButton, Stack, Tooltip } from "@mui/material";
import { Home, Settings } from "@mui/icons-material";
import React, { useCallback, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../hooks/redux";
import UpdateIcon from "@mui/icons-material/Update";
import { setUpdateModalOpen } from "../../store/update/slice";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ELECTRON_UPDATE_FLAG } from "../../utils/constants";
import { useAppInfo } from "../../hooks/app-info";
import { useSettingsModalContext } from "../../providers/SettingsProvider";
import { ignoreFocus } from "../../utils/focus";

const tooltipPosition = {
  anchorOrigin: {
    vertical: "center",
    horizontal: "right",
  },
  transformOrigin: {
    vertical: "center",
    horizontal: "left",
  },
};

const repoOwner = "SipCya";
const repoName = "Osu-Coach";

const latestReleaseUrl = `https://github.com/${repoOwner}/${repoName}/releases/latest`;
const latestReleaseApi = `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`;

function LanguageToggle() {
  const { t, language, setLanguage } = useTranslation();
  return (
    <Tooltip title={t("language.toggleTooltip")} placement={"right"}>
      <Button
        size={"small"}
        variant={"outlined"}
        onClick={() => setLanguage(language === "it" ? "en" : "it")}
        sx={{ minWidth: 0, px: 1, fontWeight: 800, color: "text.primary", borderColor: "divider" }}
      >
        {language.toUpperCase()}
      </Button>
    </Tooltip>
  );
}

function useCheckForUpdate() {
  const { appVersion } = useAppInfo();
  const { newVersion } = useAppSelector((state) => state.updater);
  const [state, setState] = useState<{ hasNewUpdate: boolean; latestVersion: string }>({
    hasNewUpdate: false,
    latestVersion: "",
  });
  useEffect(() => {
    (async function () {
      const response = await fetch(latestReleaseApi);
      const json = await response.json();

      const tagName = json["tag_name"] as string;
      if (!tagName) {
        return;
      }
      const latestVersion = tagName.substring(1);
      const hasNewUpdate = appVersion !== latestVersion;
      setState({ hasNewUpdate, latestVersion });
      console.log(
        `Current release: ${appVersion} and latest release: ${latestVersion}, therefore hasNewUpdate=${hasNewUpdate}`,
      );
    })();
  }, [appVersion]);

  if (ELECTRON_UPDATE_FLAG) {
    return { hasNewUpdate: newVersion !== appVersion, latestVersion: newVersion };
  } else {
    return state;
  }
}

export function LeftMenuSidebar() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const location = useLocation();
  const navigate = useNavigate();

  const state = useCheckForUpdate();

  const openUpdateModal = () => dispatch(setUpdateModalOpen(true));

  const onNewUpdateAvailableButtonClick = useCallback(() => {
    if (ELECTRON_UPDATE_FLAG) {
      openUpdateModal();
    } else {
      window.open(latestReleaseUrl);
    }
  }, []);
  const { onSettingsModalOpenChange } = useSettingsModalContext();
  const inReplayViewer = location.pathname.endsWith("/analyzer");
  const handleLinkClick = (to: string) => () => navigate(to);
  const buttonColor = (name: string) => (location.pathname.endsWith(name) ? "primary" : "default");

  return (
    <Stack
      sx={{
        width: (theme) => theme.spacing(10),
        paddingBottom: 2,
      }}
      gap={1}
      p={1}
      alignItems={"center"}
      component={"nav"}
    >
      <Box onClick={handleLinkClick("/app/home")} sx={{ cursor: "pointer" }}>
        <AppLogo />
      </Box>
      <Divider orientation={"horizontal"} sx={{ borderWidth: 1, width: "80%" }} />
      <Tooltip title={t("sidebar.overview")} placement={"right"}>
        <Link to={"/app/home"}>
          <IconButton color={buttonColor("/home")}>
            <Home />
          </IconButton>
        </Link>
      </Tooltip>
      {inReplayViewer && (
        <Tooltip title={t("settings.title")} placement={"right"}>
          <IconButton onClick={() => onSettingsModalOpenChange(true)} onFocus={ignoreFocus}>
            <Settings />
          </IconButton>
        </Tooltip>
      )}
      <Box flexGrow={1} />
      <LanguageToggle />
    </Stack>
  );
}
