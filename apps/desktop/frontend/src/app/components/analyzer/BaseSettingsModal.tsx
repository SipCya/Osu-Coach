import { useTranslation } from "../../i18n";
import { Box, Divider, IconButton, Paper, Slider, Stack, Tab, Tabs, Tooltip, Typography } from "@mui/material";
import React from "react";
import { Close, Settings as SettingsIcon, Visibility, VisibilityOff } from "@mui/icons-material";
import { PromotionFooter } from "./BaseDialog";

interface SettingTab {
  component: React.ReactNode;
  label: string;
  icon?: React.ReactElement;
}

export interface SettingsProps {
  onClose?: () => void;
  tabs: Array<SettingTab>;

  opacity: number;
  onOpacityChange: (o: number) => unknown;

  tabIndex: number;
  onTabIndexChange: (i: number) => unknown;
}

const MIN_OPACITY = 25;
const MAX_OPACITY = 100;
const NAV_WIDTH = 180;

export function BaseSettingsModal(props: SettingsProps) {
  const { t } = useTranslation();
  const { onClose, tabs, opacity, onOpacityChange, tabIndex, onTabIndexChange } = props;
  const displayedTab = tabs[tabIndex]?.component;

  return (
    <Paper
      sx={{
        filter: `opacity(${opacity}%)`,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderRadius: 3,
        overflow: "hidden",
      }}
      elevation={6}
    >
      <Stack sx={{ py: 1.25, px: 2, alignItems: "center" }} direction={"row"} gap={1.5}>
        <SettingsIcon color={"primary"} />
        <Typography variant={"h6"} fontWeight={800}>
          {t("settings.title")}
        </Typography>
        <Box flexGrow={1} />
        <IconButton onClick={onClose} aria-label={t("common.close")}>
          <Close />
        </IconButton>
      </Stack>
      <Divider />

      <Stack direction={"row"} sx={{ flex: 1, minHeight: 0 }}>
        <Tabs
          orientation={"vertical"}
          variant={"scrollable"}
          value={tabIndex}
          onChange={(_, value: number) => onTabIndexChange(value)}
          sx={{
            width: NAV_WIDTH,
            flexShrink: 0,
            borderRight: 1,
            borderColor: "divider",
            py: 1,
            "& .MuiTab-root": {
              textTransform: "none",
              justifyContent: "flex-start",
              minHeight: 44,
              px: 2.5,
              fontWeight: 600,
            },
          }}
        >
          {tabs.map(({ label, icon }, index) => (
            <Tab label={label} key={index} icon={icon} iconPosition={"start"} />
          ))}
        </Tabs>
        <Box sx={{ flex: 1, minWidth: 0, overflowY: "auto", p: 3 }}>{displayedTab}</Box>
      </Stack>

      <Divider />
      <Stack sx={{ px: 2, py: 0.75 }} direction={"row"} alignItems={"center"} gap={2}>
        <PromotionFooter />
        <Box flexGrow={1} />
        <Typography variant={"body2"} color={"text.secondary"}>
          {t("settings.opacity")}
        </Typography>
        <Tooltip title={`${MIN_OPACITY}%`}>
          <IconButton size={"small"} onClick={() => onOpacityChange(MIN_OPACITY)}>
            <VisibilityOff fontSize={"small"} />
          </IconButton>
        </Tooltip>
        <Slider
          size={"small"}
          value={opacity}
          onChange={(_, v) => onOpacityChange(v as number)}
          step={5}
          min={MIN_OPACITY}
          max={MAX_OPACITY}
          valueLabelFormat={(value: number) => `${value}%`}
          valueLabelDisplay={"auto"}
          sx={{ width: 140 }}
        />
        <Tooltip title={`${MAX_OPACITY}%`}>
          <IconButton size={"small"} onClick={() => onOpacityChange(MAX_OPACITY)}>
            <Visibility fontSize={"small"} />
          </IconButton>
        </Tooltip>
      </Stack>
    </Paper>
  );
}
