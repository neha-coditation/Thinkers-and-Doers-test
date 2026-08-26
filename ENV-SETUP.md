# Environment / API key setup

The API keys were removed from `js/app.js`.

## Local development

1. Copy `.env.example` to `.env`.
2. Put your real values in `.env`.
3. Run:

```bash
node build-config.js
```

4. Open the site using a local web server.

`.env` is ignored by Git.

## GitHub Pages

In GitHub:

**Settings → Secrets and variables → Actions → New repository secret**

Create:

- `CONTENTFUL_SPACE_ID`
- `CONTENTFUL_DELIVERY_TOKEN`
- `WEB3FORMS_ACCESS_KEY`

The included `.github/workflows/deploy.yml` generates `js/config.js` during deployment.

### Important security note

Because this is a browser/static website, values placed in `js/config.js` are visible to visitors after deployment. Therefore:

- Contentful Delivery API credentials are normally client-side/public by design; restrict the Contentful token to the required environment/content access.
- A Web3Forms access key is also used by the browser and should be treated as a client-side form identifier.
- **Do not put database passwords, AWS secret keys, private API keys, or other true secrets in this frontend.** Those require a backend/serverless proxy.
