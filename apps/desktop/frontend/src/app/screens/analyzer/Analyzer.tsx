import { Paper, Stack } from "@mui/material";
import { PlayBar } from "../../components/analyzer/PlayBar";
import { useShortcuts } from "../../hooks/shortcuts";
import { GameCanvas } from "../../components/analyzer/GameCanvas";
import { SettingsModal } from "../../components/analyzer/SettingsModal";
import { useEffect } from "react";
import { environment } from "../../../environments/environment";
import { useAnalysisApp } from "../../providers/TheaterProvider";
import { MistakesPanel } from "../../components/coach/MistakesPanel";

export function Analyzer() {
  const analyzer = useAnalysisApp();
  useShortcuts();

  useEffect(() => {
    void analyzer.initialize();
    if (environment.debugAnalyzer) {
      void analyzer.loadReplay(environment.debugAnalyzer.replayPath);
    }
  }, [analyzer]);

  return (
    <>
      <SettingsModal />
      <Stack
        direction={"row"}
        sx={{
          p: 2,
          flexGrow: 1,
          height: "100%",
          minWidth: 0,
        }}
        gap={2}
      >
        <Stack sx={{ flex: 1, minWidth: 0 }} gap={2}>
          <GameCanvas />
          <Paper elevation={1} sx={{ boxShadow: "none" }}>
            <PlayBar />
          </Paper>
        </Stack>
        <MistakesPanel />
      </Stack>
    </>
  );
}
