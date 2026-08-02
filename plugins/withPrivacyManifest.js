/**
 * Config plugin that injects a minimal PrivacyInfo.xcprivacy into the iOS build.
 * Apple kräver detta för alla appar sedan 2024.
 *
 * "NSPrivacyTracking: false" — appen spårar inte användaren.
 * Lägg till fler NSPrivacyAccessedAPITypes om du lägger till APIs som
 * FileTimestamp, UserDefaults, System Boot Time, eller Disk Space.
 */
const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const PRIVACY_MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyTrackingDomains</key>
  <array/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array/>
  <key>NSPrivacyAccessedAPITypes</key>
  <array/>
</dict>
</plist>
`;

const withPrivacyManifest = (config) =>
  withDangerousMod(config, [
    "ios",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const iosDir = path.join(projectRoot, "ios", config.modRequest.projectName);
      const manifestPath = path.join(iosDir, "PrivacyInfo.xcprivacy");

      if (fs.existsSync(iosDir)) {
        fs.writeFileSync(manifestPath, PRIVACY_MANIFEST, "utf8");
      }

      return config;
    },
  ]);

module.exports = withPrivacyManifest;
