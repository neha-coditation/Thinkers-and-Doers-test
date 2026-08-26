# Environment / API key setup

There is one configuration flow for the site:

```text
GitHub Actions Secrets
        ↓
build-config.js
        ↓
js/config.js
        ↓
app.js
```

## Local development

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Put the values in `.env`, then run:

```bash
node build-config.js
```

This creates `js/config.js`.

**Do not commit `.env` or `js/config.js`.**

## GitHub Pages

Add these repository secrets:

- `CONTENTFUL_SPACE_ID`
- `CONTENTFUL_DELIVERY_TOKEN`
- `WEB3FORMS_ACCESS_KEY`

The deployment workflow generates `js/config.js` automatically.

## Important

There should not be another `contentful-config` file containing duplicate credentials.

`app.js` only reads:

```js
window.CONTENTFUL_CONFIG.spaceId
window.CONTENTFUL_CONFIG.deliveryToken
```

and:

```js
window.WEB3FORMS_CONFIG.accessKey
```

For a static frontend, browser-required values can still be visible in the deployed JavaScript. True private secrets must be kept behind a backend/serverless function.
