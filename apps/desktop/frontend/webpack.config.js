const { merge } = require("webpack-merge");

module.exports = (config, context) => {
  return merge(config, {
    target: "electron-renderer",
    externals: {
      fsevents: "require('fsevents')",
    },
  });
};
