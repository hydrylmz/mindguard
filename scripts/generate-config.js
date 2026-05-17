const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");
const templatePath = path.join(__dirname, "..", "config.template.js");
const outputPath = path.join(__dirname, "..", "config.js");

// Read .env file
const envRaw = fs.readFileSync(envPath, "utf-8");
const envVars = {};
for (const line of envRaw.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const value = trimmed.slice(eqIdx + 1).trim();
  envVars[key] = value;
}

// Read template and substitute
let template = fs.readFileSync(templatePath, "utf-8");
for (const [key, value] of Object.entries(envVars)) {
  template = template.replace(new RegExp(`{{${key}}}`, "g"), value);
}

// Write output
fs.writeFileSync(outputPath, template, "utf-8");
console.log("config.js generated from .env");
