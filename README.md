# Nova Browser
Yet another electron-based browser, Nova browser is designed to be an all-in-one browser featuring modes, AI tab grouping, and more!

## Installation

### Option 1: Pre-built (Recommended) (Windows Only)
Visit the [Releases](https://github.com/Lordseriouspig/Nova-Browser/releases) page to download the latest version for your platform:
- **Windows**: Download the `.exe` installer or the `.zip` portable version.

### Option 2: Build from Source (All platforms)
If you are on Mac or Linux, you will have to build from the source.

#### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher)
- [Git](https://git-scm.com/)

#### Steps
1. **Clone the repository**
   ```bash
   git clone https://github.com/Lordseriouspig/Nova-Browser.git
   cd Nova-Browser
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run in development mode**
   ```bash
   npm start
   ```

4. **Build for your platform**
   ```bash
   # Package the app (creates distributable folder)
   npm run package
   
   # Create installer/package for distribution
   npm run make
   ```

#### Platform-specific builds
The `npm run make` command creates platform-specific distributables:
- **Windows**: `.exe` installer (Squirrel)
- **macOS**: `.dmg` file
- **Linux**: `.deb` and `.rpm` packages

Built files will be available in the `out/` directory.

## License
Licensed under the Apache-2.0 License. See [LICENSE](LICENSE) for more information.
