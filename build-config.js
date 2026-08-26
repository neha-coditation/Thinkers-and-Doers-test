const fs = require("fs");

function loadEnv(file = ".env") {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnv();

const required = [
  "CONTENTFUL_SPACE_ID",
  "CONTENTFUL_DELIVERY_TOKEN",
  "WEB3FORMS_ACCESS_KEY"
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing ${key}`);
    process.exit(1);
  }
}

const esc = value => String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const output = `// Generated file. Do not edit or commit.
window.CONTENTFUL_CONFIG = {
  spaceId: "${esc(process.env.CONTENTFUL_SPACE_ID)}",
  deliveryToken: "${esc(process.env.CONTENTFUL_DELIVERY_TOKEN)}"
};

window.WEB3FORMS_CONFIG = {
  accessKey: "${esc(process.env.WEB3FORMS_ACCESS_KEY)}"
};
`;

fs.writeFileSync("js/config.js", output);
console.log("Generated js/config.js");
