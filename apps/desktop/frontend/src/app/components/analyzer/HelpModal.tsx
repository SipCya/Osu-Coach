import { useTranslation } from "../../i18n";
import React from "react";
import styled from "styled-components";
import { Box, Divider, IconButton, Modal, Paper, Stack, Typography } from "@mui/material";
import { Close, Help } from "@mui/icons-material";
import { PromotionFooter } from "./BaseDialog";

export function Key({ text }: { text: string }) {
  return (
    <Box
      component={"span"}
      sx={{
        backgroundColor: "hsl(0,2%,44%)",
        fontFamily: "monospace",
        borderStyle: "solid",
        borderRadius: 1,
        borderWidth: "0px 4px 4px 0",
        borderColor: "hsl(0,2%,20%)",
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      {text}
    </Box>
  );
}

const ShortcutBox = styled.div`
  display: grid;
  grid-template-columns: max-content 1fr;
  grid-column-gap: 1em;
  grid-row-gap: 0.5em;
  align-items: center;
  justify-content: center;
`;

const leftArrowKey = "←";
const rightArrowKey = "→";
const upArrowKey = "↑";
const downArrowKey = "↓";

const leftKeys = [leftArrowKey, "a"];
const rightKeys = [rightArrowKey, "d"];

function KeyBindings({ separator = "+", keys, inline }: { separator?: string; keys: string[]; inline?: boolean }) {
  return (
    <div className={inline ? "inline" : ""}>
      {keys.map((k, i) => (
        <React.Fragment key={i}>
          <Key text={k} />
          {i + 1 < keys.length && ` ${separator} `}
        </React.Fragment>
      ))}
    </div>
  );
}

function Title({ children }: any) {
  return <Typography variant={"h6"}>{children}</Typography>;
}

const orSeparator = " / ";

function PlaybarNavigationShortcuts() {
  const { t } = useTranslation();
  return (
    <Stack sx={{ py: 2 }} flexDirection={"column"} gap={1}>
      <Title>{t("help.shortcuts")}</Title>
      <ShortcutBox>
        <KeyBindings keys={["Spacebar"]} /> <span>{t("help.startPause")}</span>
        <KeyBindings separator={orSeparator} keys={[upArrowKey, "w"]} /> <span>{t("help.increaseSpeed")}</span>
        <KeyBindings separator={orSeparator} keys={[downArrowKey, "s"]} /> <span>{t("help.decreaseSpeed")}</span>
        <KeyBindings separator={orSeparator} keys={leftKeys} /> <span>{t("help.smallBack")}</span>
        <KeyBindings separator={orSeparator} keys={rightKeys} /> <span>{t("help.smallForward")}</span>
        <KeyBindings separator={"+"} keys={["Ctrl", leftArrowKey]} />
        <span>{t("help.microBack")}</span>
        <KeyBindings separator={"+"} keys={["Ctrl", rightArrowKey]} />
        <span>{t("help.microForward")}</span>
        <KeyBindings separator={"+"} keys={["Shift", leftArrowKey]} />
        <span>{t("help.largeBack")}</span>
        <KeyBindings separator={"+"} keys={["Shift", rightArrowKey]} />
        <span>{t("help.largeForward")}</span>
        <KeyBindings keys={["f"]} /> <span>{t("help.toggleHidden")}</span>
      </ShortcutBox>
      <Typography variant={"body2"} color={"text.secondary"}>
        {t("help.wheel")}
      </Typography>
    </Stack>
  );
}

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HelpBox(props: Pick<HelpModalProps, "onClose">) {
  const { t } = useTranslation();
  const { onClose } = props;
  return (
    <Paper sx={{ px: 2, py: 2, display: "flex", flexDirection: "column" }}>
      <Stack sx={{ alignItems: "center" }} direction={"row"} gap={1}>
        <Help />
        <Typography fontWeight={"bolder"}>{t("common.help")}</Typography>
        <Box flexGrow={1} />
        <IconButton onClick={onClose}>
          <Close />
        </IconButton>
      </Stack>
      <Divider />

      <PlaybarNavigationShortcuts />
      <Divider />
      <Stack sx={{ paddingTop: 1 }}>
        <PromotionFooter />
      </Stack>
    </Paper>
  );
}

export function HelpModalDialog(props: HelpModalProps) {
  const { isOpen, onClose } = props;

  return (
    <Modal open={isOpen} onClose={onClose}>
      <Box
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          minWidth: 600,
          maxWidth: "100%",
          maxHeight: "100%",
        }}
      >
        <HelpBox onClose={onClose} />
      </Box>
    </Modal>
  );
}
