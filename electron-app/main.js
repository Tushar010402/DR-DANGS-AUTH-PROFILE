const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const { startServer, stopServer } = require('./server');

let mainWindow = null;
let tray = null;
let serverRunning = false;

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 450,
    height: 350,
    resizable: false,
    maximizable: false,
    minimizable: true,
    fullscreenable: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (app.isQuitting) {
      mainWindow = null;
    } else {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  // Create tray icon
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  let trayIcon;

  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  } catch (e) {
    // Fallback: create a simple colored icon
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Dr. Dangs Fingerprint Service - Running');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      }
    },
    {
      label: 'Open Auth Portal',
      click: () => {
        shell.openExternal('https://auth.drdangscentrallab.com');
      }
    },
    { type: 'separator' },
    {
      label: serverRunning ? '✓ Service Running' : '✗ Service Stopped',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      createWindow();
    }
  });
}

function updateTrayMenu() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      }
    },
    {
      label: 'Open Auth Portal',
      click: () => {
        shell.openExternal('https://auth.drdangscentrallab.com');
      }
    },
    { type: 'separator' },
    {
      label: serverRunning ? '✓ Service Running on port 5050' : '✗ Service Stopped',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

app.whenReady().then(async () => {
  // Start the fingerprint service
  try {
    await startServer();
    serverRunning = true;
    console.log('Fingerprint service started');
  } catch (err) {
    console.error('Failed to start service:', err);
  }

  createTray();
  createWindow();
  updateTrayMenu();

  // macOS: Re-create window when dock icon clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  // Don't quit on macOS when window closed
  if (process.platform !== 'darwin') {
    // On Windows/Linux, keep running in tray
  }
});

app.on('before-quit', async () => {
  app.isQuitting = true;
  await stopServer();
});

// Handle macOS open-at-login
if (process.platform === 'darwin') {
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: true
  });
}
