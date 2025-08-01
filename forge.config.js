const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    icon: './assets/icon/icon', // Electron will automatically append the correct extension
    name: 'Nova Browser',
    executableName: 'nova-browser',
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        iconUrl: 'https://raw.githubusercontent.com/Lordseriouspig/Nova-Browser/main/assets/icon/icon-win.ico',
        setupIcon: './assets/icon/icon-win.ico',
        loadingGif: './assets/icon/icon-win.ico',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
      config: {
        icon: './assets/icon/icon-mac.icns',
      },
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          icon: './assets/icon/icon-linux.png',
          maintainer: 'Lordseriouspig',
          homepage: 'https://github.com/Lordseriouspig/Nova-Browser',
        },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          icon: './assets/icon/icon-linux.png',
          maintainer: 'Lordseriouspig',
          homepage: 'https://github.com/Lordseriouspig/Nova-Browser',
        },
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
