import { useTranslation } from "../../i18n";
import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { useAppInfo } from "../../hooks/app-info";

export function HomeScreen() {
  const { t } = useTranslation();
  const { appVersion } = useAppInfo();
  return (
    <Stack gap={4} sx={{ justifyContent: "center", alignItems: "center", margin: "auto", height: "100%" }}>
      <Stack alignItems={"center"}>
        <Typography sx={{ userSelect: "none", fontWeight: 800, fontSize: "2.5em", lineHeight: 1 }}>
          <Box component={"span"} sx={{ color: "#ff66aa" }}>
            osu!
          </Box>
          coach
        </Typography>
        <Typography color={"text.secondary"} sx={{ mt: 2, mb: 2, maxWidth: 480, textAlign: "center" }}>
          {t("home.hint")}
        </Typography>
        <Typography fontSize={"caption.fontSize"} color={"text.secondary"}>
          {t("home.version", { version: appVersion })}
        </Typography>
      </Stack>
    </Stack>
  );
}
