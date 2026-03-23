const { execFileSync } = require("child_process");
const path = require("path");
const { sign: macSign } = require("app-builder-lib/out/codeSign/macCodeSign");

/**
 * Clear xattrs / AppleDouble that break codesign.
 * Must run after `doAddElectronFuses` (use `mac.sign`); `afterPack` runs *before* fuses.
 * `xattr -r -d` does not walk inside nested `.app` bundles; `find -exec xattr -d` does (Desktop / iCloud FinderInfo).
 */
function stripMacosBundleMetadata(appPath) {
  if (process.platform !== "darwin" || !appPath) return;
  const findStrip = (name) => {
    try {
      execFileSync("/usr/bin/find", [
        appPath,
        "-exec",
        "/usr/bin/xattr",
        "-d",
        name,
        "{}",
        ";",
      ], { stdio: "ignore" });
    } catch {
      /* ignore */
    }
  };
  findStrip("com.apple.FinderInfo");
  findStrip("com.apple.provenance");
  try {
    execFileSync("/usr/bin/xattr", ["-cr", appPath], { stdio: "ignore" });
  } catch {
    /* ignore */
  }
  try {
    execFileSync("/usr/bin/find", [appPath, "-name", "._*", "-delete"]);
  } catch {
    /* ignore */
  }
}

module.exports = {
  appId: "com.orbis.ide",
  productName: "Orbis",
  directories: {
    output: "release",
    buildResources: "build",
  },
  icon: "public/orbis-icon.png",
  asarUnpack: ["**/node_modules/node-pty/**/*"],
  afterPack: async (context) => {
    if (process.platform !== "darwin") return;
    const appPath = path.join(
      context.appOutDir,
      `${context.packager.appInfo.productFilename}.app`,
    );
    stripMacosBundleMetadata(appPath);
  },
  mac: {
    sign: async (opts) => {
      stripMacosBundleMetadata(opts.app);
      // mac.sign sets options.sign; electron-builder then skips ad-hoc identity fallback unless opts.identity is set (macPackager sign()).
      return macSign({
        ...opts,
        identity: opts.identity != null && opts.identity !== "" ? opts.identity : "-",
      });
    },
  },
};
