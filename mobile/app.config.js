// Build-time additions to app.json, all optional (the app builds and works without them; only push
// notifications stay off). See README.md → "Notificări push".
// - Firebase file for Android push: mobile/google-services.json (not committed) or the EAS file
//   variable GOOGLE_SERVICES_JSON.
// - Expo project id (from `npx eas-cli init`) for Expo push tokens: app.json extra.eas.projectId or
//   the EAS_PROJECT_ID variable (used by the GitHub Actions APK build).
const fs = require("fs");
const path = require("path");

module.exports = ({ config }) => {
  const local = path.join(__dirname, "google-services.json");
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(local) ? "./google-services.json" : undefined);
  const projectId = config.extra?.eas?.projectId || process.env.EAS_PROJECT_ID || undefined;
  return {
    ...config,
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
    extra: { ...config.extra, ...(projectId ? { eas: { ...config.extra?.eas, projectId } } : {}) }
  };
};
