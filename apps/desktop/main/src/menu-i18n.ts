export type MenuLanguage = "en" | "it";

const en = {
  file: "File",
  openReplay: "Open Replay",
  replayFilter: "osu! Replay",
  allFiles: "All Files",
  openInstallFolder: "Open Installation Folder",
  openConfigFolder: "Open User Config Folder",
  openLogsFolder: "Open Logs Folder",
  openOsuFolder: "Open osu! Folder",
  close: "Close Window",
  view: "View",
  reload: "Reload",
  forceReload: "Force Reload",
  devTools: "Toggle Developer Tools",
  help: "Help",
  documentation: "osu!coach on GitHub",
  about: "About",
  aboutTitle: "About osu!coach",
  aboutMessage: "osu!coach {version}",
  services: "Services",
  hide: "Hide",
  hideOthers: "Hide Others",
  unhide: "Unhide",
  quit: "Quit",
};

const it: typeof en = {
  file: "File",
  openReplay: "Apri replay",
  replayFilter: "Replay di osu!",
  allFiles: "Tutti i file",
  openInstallFolder: "Apri la cartella di installazione",
  openConfigFolder: "Apri la cartella delle impostazioni",
  openLogsFolder: "Apri la cartella dei log",
  openOsuFolder: "Apri la cartella di osu!",
  close: "Chiudi la finestra",
  view: "Visualizza",
  reload: "Ricarica",
  forceReload: "Ricarica forzata",
  devTools: "Strumenti per sviluppatori",
  help: "Aiuto",
  documentation: "osu!coach su GitHub",
  about: "Informazioni",
  aboutTitle: "Informazioni su osu!coach",
  aboutMessage: "osu!coach {version}",
  services: "Servizi",
  hide: "Nascondi",
  hideOthers: "Nascondi gli altri",
  unhide: "Mostra tutto",
  quit: "Esci",
};

export type MenuTexts = typeof en;

export function menuTexts(language: MenuLanguage): MenuTexts {
  return language === "it" ? it : en;
}
