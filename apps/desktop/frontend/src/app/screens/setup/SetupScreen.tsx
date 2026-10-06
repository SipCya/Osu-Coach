import { useTranslation } from "../../i18n";
import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Box, Button, IconButton, InputBase, Paper, Stack, Typography } from "@mui/material";
import { AppLogo } from "../../components/logo/AppLogo";
import { Help, RocketLaunch } from "@mui/icons-material";
import FolderIcon from "@mui/icons-material/Folder";
import { frontendAPI } from "../../api";
import { useNavigate } from "react-router-dom";
import { useAnalysisApp } from "../../providers/TheaterProvider";

interface DirectorySelectionProps {
  value: string | null;
  onChange: (value: string | null) => void;
  placeHolder: string;
  badgeOnEmpty?: boolean;
}

function DirectorySelection({ value, onChange, placeHolder, badgeOnEmpty }: DirectorySelectionProps) {
  const handleSelectFolderClick = useCallback(() => {
    frontendAPI.selectDirectory(value ?? "").then((path) => {
      if (path !== null) {
        onChange(path);
      }
    });
  }, [onChange, value]);

  const onInputChange = useCallback(
    (event: any) => {
      onChange(event.target.value);
    },
    [onChange],
  );

  const invisibleBadge = !badgeOnEmpty || !!value;
  return (
    <Paper sx={{ px: 2, py: 1, display: "flex", alignItems: "center", width: 400 }} elevation={2}>
      <InputBase
        sx={{ flex: 1 }}
        placeholder={placeHolder}
        value={value ?? ""}
        onChange={onInputChange}
        disabled={true}
      />
      <IconButton onClick={handleSelectFolderClick}>
        <Badge invisible={invisibleBadge} color={"primary"} variant={"dot"}>
          <FolderIcon />
        </Badge>
      </IconButton>
    </Paper>
  );
}

const setupWikiUrl = "https://github.com/SipCya/Osu-Coach#readme";

export function SetupScreen() {
  const { t } = useTranslation();
  const [directoryPath, setDirectoryPath] = useState<string | null>(null);
  const [saveEnabled, setSaveEnabled] = useState(false);
  const navigate = useNavigate();
  const analyzer = useAnalysisApp();
  const [showErrorMessage, setShowErrorMessage] = useState(false);

  const handleConfirmClick = useCallback(async () => {
    if (!directoryPath) {
      return;
    }
    const isValid = await analyzer.osuFolderService.isValidOsuFolder(directoryPath);
    if (isValid) {
      analyzer.osuFolderService.setOsuFolder(directoryPath);
      navigate("/app/analyzer");
    } else {
      setShowErrorMessage(true);
    }
  }, [navigate, analyzer.osuFolderService, directoryPath]);

  const handleOnDirectoryChange = useCallback(
    (path: string | null) => {
      setDirectoryPath(path);
      setShowErrorMessage(false);
    },
    [setShowErrorMessage],
  );

  useEffect(() => {
    setSaveEnabled(directoryPath !== null);
  }, [directoryPath]);

  return (
    <Box
      sx={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Paper elevation={1}>
        <Stack gap={2} sx={{ px: 6, py: 4 }}>
          <AppLogo />
          <Typography variant={"h6"} sx={{ textAlign: "center" }}>
            {t("setup.title")}
          </Typography>
          {showErrorMessage && (
            <>
              <Alert severity="error" variant="filled">
                <div>{t("setup.invalid")}</div>
              </Alert>
            </>
          )}
          <DirectorySelection
            value={directoryPath}
            onChange={handleOnDirectoryChange}
            placeHolder={t("setup.placeholder")}
            badgeOnEmpty={true}
          />
          <Stack direction={"row-reverse"} gap={2}>
            <Button
              variant={"contained"}
              startIcon={<RocketLaunch />}
              disabled={!saveEnabled}
              onClick={handleConfirmClick}
            >
              {t("setup.save")}
            </Button>
            <Button variant={"text"} onClick={() => window.open(setupWikiUrl)} startIcon={<Help />}>
              {t("common.help")}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
