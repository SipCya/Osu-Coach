import { useTranslation } from "../../i18n";
import { HashLoader } from "react-spinners";
import { Stack } from "@mui/material";

export function SplashScreen() {
  const { t } = useTranslation();
  return (
    <Stack
      sx={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      gap={2}
    >
      <HashLoader color={"white"} loading={true} />
      <div>{t("app.loading")}</div>
    </Stack>
  );
}
