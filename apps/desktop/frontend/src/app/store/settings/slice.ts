import { createSlice } from "@reduxjs/toolkit";

interface SettingsModalState {
  open: boolean;
}

const initialState: SettingsModalState = {
  open: false,
};

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    settingsModalClosed(state) {
      state.open = false;
    },
    settingsModalOpened(state) {
      state.open = true;
    },
  },
});

export const { settingsModalClosed, settingsModalOpened } = settingsSlice.actions;
export default settingsSlice.reducer;
