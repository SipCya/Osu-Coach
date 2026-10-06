import { IconButton, Link, Typography } from "@mui/material";
import { FaDiscord } from "react-icons/fa";
import React from "react";
import { useCommonManagers } from "../../providers/TheaterProvider";

export function PromotionFooter() {
  const appVersion = useCommonManagers().appInfoService.version;
  return (
    <Typography fontSize={"caption.fontSize"} color={"text.secondary"}>
      osu!coach {appVersion}
    </Typography>
  );
}
