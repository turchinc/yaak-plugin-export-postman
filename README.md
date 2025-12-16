# Yaak Postman Export Plugin

This plugin demonstrates exporting Yaak requests/collections to Postman Collection v2.1 JSON.

Features
- Adds an "Export to Postman" action to request context menu (writes `postman-<id>.json` to cwd).
 - Adds an "Export to Postman" action to request context menu (writes `postman-<id>.json` to cwd).
 - Adds an example "Export Collection to Postman" collection-level action (writes a minimal collection JSON; full collection export requires a listing API).
- Provides a converter function `yaakToPostman` and a small CLI to convert Yaak JSON files.

Usage

From Yaak UI (when plugin is installed):
- Right click a request and choose "Export to Postman" — the plugin writes `postman-<id>.json` to the current working directory and shows a toast.

CLI (development):

Install dev deps and run:

```bash
npm install
npx ts-node src/cli.ts path/to/yaak-export.json out.postman.json
```

Tests

```bash
npx vitest run
```

Notes
- The converter accepts a simple Yaak collection shape: { name, variables, requests: [{id,name,method,url,headers,body,description}] }
- You can expand mapping (query params, auth, formdata, multi-request collections, folders) to better match Postman's schema.
