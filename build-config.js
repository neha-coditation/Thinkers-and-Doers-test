const fs = require("fs");

const required = [
  "CONTENTFUL_SPACE_ID",
  "CONTENTFUL_DELIVERY_TOKEN",
  "WEB3FORMS_ACCESS_KEY"
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing GitHub Actions secret: ${key}`);
    process.exit(1);
  }
}

const esc = value =>
  String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const output = `// Generated during deployment. Do not commit.
window.CONTENTFUL_CONFIG = {
  spaceId: "${esc(process.env.CONTENTFUL_SPACE_ID)}",
  deliveryToken: "${esc(process.env.CONTENTFUL_DELIVERY_TOKEN)}",
  environment: "master",
  contentType: "episode",
  guestContentType: "guest",
  enabled: true
};

window.WEB3FORMS_CONFIG = {
  accessKey: "${esc(process.env.WEB3FORMS_ACCESS_KEY)}"
};
`;

fs.writeFileSync("js/config.js", output);
console.log("Generated js/config.js");
