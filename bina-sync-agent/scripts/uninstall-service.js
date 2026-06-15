const Service = require("node-windows").Service;
const path = require("path");

const svc = new Service({
  name: "BINA Sync Agent",
  script: path.join(__dirname, "..", "dist", "index.js"),
});

svc.on("uninstall", () => {
  console.log("Service uninstalled.");
});

svc.uninstall();
