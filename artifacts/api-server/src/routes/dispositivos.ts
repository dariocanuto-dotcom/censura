import { Router } from "express";
import { execFile } from "node:child_process";

const router = Router();

router.get("/local-hardware", (_req, res) => {
  if (process.platform !== "win32") { res.json({ drives: [], tuners: [], erro: "Busca disponível no servidor Windows." }); return; }
  const command = "$drives=@(Get-CimInstance Win32_LogicalDisk | Where-Object {$_.DriveType -in 2,3} | Select-Object DeviceID,VolumeName,FreeSpace); $tuners=@(Get-CimInstance Win32_PnPEntity | Where-Object {$_.Name -match 'BDA|DVB|ISDB|TV.*Tuner|Digital.*TV|Broadcast'} | Select-Object Name,DeviceID,Status); @{drives=$drives;tuners=$tuners} | ConvertTo-Json -Depth 4 -Compress";
  execFile("powershell.exe", ["-NoProfile", "-Command", command], { timeout: 15000, windowsHide: true }, (error, stdout) => {
    if (error) { res.status(500).json({ erro: "Não foi possível enumerar dispositivos locais." }); return; }
    try { res.json(JSON.parse(stdout)); } catch { res.status(500).json({ erro: "Resposta de dispositivos inválida." }); }
  });
});

/**
 * Simulated Blackmagic Design DeckLink SDK device enumeration.
 * In production this would call the DeckLink C++ SDK via node-addon-api.
 * Follows the BMD DeckLink API property naming (IDeckLink, IDeckLinkInput).
 */
const BMD_DEVICES = [
  {
    id: "bmd-0001",
    deviceName: "DeckLink Mini Recorder 4K",
    modelName: "DeckLink Mini Recorder 4K",
    vendorName: "Blackmagic Design",
    topologicalId: 0,
    persistentId: "0x80B4A55B",
    deviceGroupId: 0,
    connectors: ["SDI", "HDMI"],
    numPorts: 1,
    supportedVideoModes: [
      { name: "HD 1080i 50", frameRate: "25", resolution: "1920x1080", interlaced: true, pixelFormat: "8-bit YUV 4:2:2" },
      { name: "HD 1080i 59.94", frameRate: "29.97", resolution: "1920x1080", interlaced: true, pixelFormat: "8-bit YUV 4:2:2" },
      { name: "HD 1080p 23.98", frameRate: "23.98", resolution: "1920x1080", interlaced: false, pixelFormat: "8-bit YUV 4:2:2" },
      { name: "HD 1080p 25", frameRate: "25", resolution: "1920x1080", interlaced: false, pixelFormat: "8-bit YUV 4:2:2" },
      { name: "HD 1080p 29.97", frameRate: "29.97", resolution: "1920x1080", interlaced: false, pixelFormat: "8-bit YUV 4:2:2" },
      { name: "HD 1080p 30", frameRate: "30", resolution: "1920x1080", interlaced: false, pixelFormat: "8-bit YUV 4:2:2" },
      { name: "HD 1080p 50", frameRate: "50", resolution: "1920x1080", interlaced: false, pixelFormat: "8-bit YUV 4:2:2" },
      { name: "HD 1080p 60", frameRate: "60", resolution: "1920x1080", interlaced: false, pixelFormat: "8-bit YUV 4:2:2" },
      { name: "4K DCI 23.98", frameRate: "23.98", resolution: "4096x2160", interlaced: false, pixelFormat: "10-bit YUV 4:2:2" },
      { name: "4K UHD 25", frameRate: "25", resolution: "3840x2160", interlaced: false, pixelFormat: "10-bit YUV 4:2:2" },
      { name: "4K UHD 29.97", frameRate: "29.97", resolution: "3840x2160", interlaced: false, pixelFormat: "10-bit YUV 4:2:2" },
      { name: "4K UHD 30", frameRate: "30", resolution: "3840x2160", interlaced: false, pixelFormat: "10-bit YUV 4:2:2" },
    ],
    audioChannels: [2, 8, 16],
    linkMode: ["single"],
    signalPresent: true,
    firmwareVersion: "14.0.0",
    driverVersion: "14.0.0",
  },
  {
    id: "bmd-0002",
    deviceName: "DeckLink Duo 2",
    modelName: "DeckLink Duo 2",
    vendorName: "Blackmagic Design",
    topologicalId: 1,
    persistentId: "0xC2143A98",
    deviceGroupId: 1,
    connectors: ["SDI"],
    numPorts: 4,
    supportedVideoModes: [
      { name: "SD 625i 50", frameRate: "25", resolution: "720x576", interlaced: true, pixelFormat: "8-bit YUV 4:2:2" },
      { name: "SD 525i 59.94", frameRate: "29.97", resolution: "720x486", interlaced: true, pixelFormat: "8-bit YUV 4:2:2" },
      { name: "HD 720p 50", frameRate: "50", resolution: "1280x720", interlaced: false, pixelFormat: "8-bit YUV 4:2:2" },
      { name: "HD 720p 59.94", frameRate: "59.94", resolution: "1280x720", interlaced: false, pixelFormat: "8-bit YUV 4:2:2" },
      { name: "HD 1080i 50", frameRate: "25", resolution: "1920x1080", interlaced: true, pixelFormat: "8-bit YUV 4:2:2" },
      { name: "HD 1080i 59.94", frameRate: "29.97", resolution: "1920x1080", interlaced: true, pixelFormat: "8-bit YUV 4:2:2" },
      { name: "HD 1080p 25", frameRate: "25", resolution: "1920x1080", interlaced: false, pixelFormat: "8-bit YUV 4:2:2" },
      { name: "HD 1080p 29.97", frameRate: "29.97", resolution: "1920x1080", interlaced: false, pixelFormat: "8-bit YUV 4:2:2" },
      { name: "HD 1080p 30", frameRate: "30", resolution: "1920x1080", interlaced: false, pixelFormat: "8-bit YUV 4:2:2" },
    ],
    audioChannels: [2, 8, 16],
    linkMode: ["single", "dual"],
    signalPresent: false,
    firmwareVersion: "14.0.0",
    driverVersion: "14.0.0",
  },
  {
    id: "bmd-0003",
    deviceName: "DeckLink 8K Pro",
    modelName: "DeckLink 8K Pro",
    vendorName: "Blackmagic Design",
    topologicalId: 2,
    persistentId: "0xD7F2891C",
    deviceGroupId: 2,
    connectors: ["SDI 12G", "SDI 3G", "HDMI"],
    numPorts: 4,
    supportedVideoModes: [
      { name: "HD 1080p 50", frameRate: "50", resolution: "1920x1080", interlaced: false, pixelFormat: "10-bit YUV 4:2:2" },
      { name: "HD 1080p 60", frameRate: "60", resolution: "1920x1080", interlaced: false, pixelFormat: "10-bit YUV 4:2:2" },
      { name: "4K UHD 50", frameRate: "50", resolution: "3840x2160", interlaced: false, pixelFormat: "10-bit YUV 4:2:2" },
      { name: "4K UHD 60", frameRate: "60", resolution: "3840x2160", interlaced: false, pixelFormat: "10-bit YUV 4:2:2" },
      { name: "8K DCI 23.98", frameRate: "23.98", resolution: "8192x4320", interlaced: false, pixelFormat: "12-bit RAW" },
      { name: "8K UHD 30", frameRate: "30", resolution: "7680x4320", interlaced: false, pixelFormat: "12-bit RAW" },
    ],
    audioChannels: [2, 8, 16],
    linkMode: ["single", "dual", "quad"],
    signalPresent: true,
    firmwareVersion: "14.1.0",
    driverVersion: "14.1.0",
  },
  {
    id: "bmd-0004",
    deviceName: "UltraStudio 4K Mini",
    modelName: "UltraStudio 4K Mini",
    vendorName: "Blackmagic Design",
    topologicalId: 3,
    persistentId: "0xE9A1C234",
    deviceGroupId: 3,
    connectors: ["Thunderbolt 3", "SDI 6G", "HDMI 2.0", "Analógico"],
    numPorts: 1,
    supportedVideoModes: [
      { name: "HD 1080i 50", frameRate: "25", resolution: "1920x1080", interlaced: true, pixelFormat: "10-bit YUV 4:2:2" },
      { name: "HD 1080p 25", frameRate: "25", resolution: "1920x1080", interlaced: false, pixelFormat: "10-bit YUV 4:2:2" },
      { name: "HD 1080p 29.97", frameRate: "29.97", resolution: "1920x1080", interlaced: false, pixelFormat: "10-bit YUV 4:2:2" },
      { name: "4K UHD 25", frameRate: "25", resolution: "3840x2160", interlaced: false, pixelFormat: "10-bit YUV 4:4:4" },
      { name: "4K UHD 29.97", frameRate: "29.97", resolution: "3840x2160", interlaced: false, pixelFormat: "10-bit YUV 4:4:4" },
      { name: "4K UHD 30", frameRate: "30", resolution: "3840x2160", interlaced: false, pixelFormat: "10-bit YUV 4:4:4" },
      { name: "4K UHD 60", frameRate: "60", resolution: "3840x2160", interlaced: false, pixelFormat: "10-bit YUV 4:4:4" },
    ],
    audioChannels: [2, 8],
    linkMode: ["single"],
    signalPresent: true,
    firmwareVersion: "14.0.0",
    driverVersion: "14.0.0",
  },
];

// List all Blackmagic DeckLink devices
router.get("/blackmagic", (_req, res) => {
  // Simulate a small random delay as if scanning the PCI/USB bus
  setTimeout(() => {
    res.json({
      sdkVersion: "14.0.0",
      totalDevices: BMD_DEVICES.length,
      dispositivos: BMD_DEVICES,
    });
  }, 180);
});

// Get single device
router.get("/blackmagic/:id", (req, res) => {
  const dev = BMD_DEVICES.find(d => d.id === req.params.id);
  if (!dev) { res.status(404).json({ erro: "Dispositivo não encontrado" }); return; }
  res.json(dev);
});

// Simulate signal probe on a device/port
router.post("/blackmagic/:id/probe", (req, res) => {
  const dev = BMD_DEVICES.find(d => d.id === req.params.id);
  if (!dev) { res.status(404).json({ erro: "Dispositivo não encontrado" }); return; }
  // Simulate detection
  const detected = dev.signalPresent;
  res.json({
    sinalDetectado: detected,
    formato: detected && dev.supportedVideoModes.length > 0 ? dev.supportedVideoModes[0] : null,
    mensagem: detected ? "Sinal detectado com sucesso" : "Nenhum sinal no conector",
  });
});

export default router;
