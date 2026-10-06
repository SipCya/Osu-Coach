const { getJestProjects } = require("@nrwl/jest");

export default {
  projects: getJestProjects(),
  setupFiles: ["dotenv/config"],
};
