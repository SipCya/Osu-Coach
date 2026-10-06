import { Stack, Typography } from "@mui/material";

export const AppLogo = () => (
  <Stack alignItems={"center"} sx={{ userSelect: "none", lineHeight: 1 }}>
    <Typography sx={{ fontWeight: 800, fontSize: "15px", color: "#ff66aa", lineHeight: 1 }}>osu!</Typography>
    <Typography sx={{ fontWeight: 800, fontSize: "11px", lineHeight: 1.2 }}>coach</Typography>
  </Stack>
);
