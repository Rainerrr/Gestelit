/**
 * Installs the BINA Sync Agent as a Windows service.
 * Run: node scripts/install-service.js
 */

const Service = require("node-windows").Service;
const path = require("path");

const svc = new Service({
  name: "BINA Sync Agent",
  description: "Syncs BINA ERP data to Gestelit manufacturing system",
  script: path.join(__dirname, "..", "dist", "index.js"),
  workingDirectory: path.join(__dirname, ".."),
  env: [
    { name: "NODE_ENV", value: "production" },
  ],
});

svc.on("install", () => {
  console.log("Service installed. Starting...");
  svc.start();
});

svc.on("start", () => {
  console.log("Service started successfully.");
});

svc.on("error", (err) => {
  console.error("Service error:", err);
});

svc.install();
