Firebase Hosting Deployment (BookPlus)

Steps to deploy your Vite app (BookPlus) to Firebase Hosting:

1. Install Firebase CLI (if not installed):

```bash
npm install -g firebase-tools
```

2. Build production assets:

```bash
npm run build
```

This will create the `dist` folder containing the production site (Vite default).

3. Login to Firebase and initialize hosting (one-time):

```bash
firebase login
firebase init hosting
```

- When prompted, select the Firebase project (or create one).
- For the public directory enter: `dist`
- Choose `Yes` for single-page app rewrite (so index.html is served for routes).

4. Deploy to Firebase:

```bash
firebase deploy --only hosting
```

5. Optional: Set `your-project-id` in `.firebaserc` to your Firebase project id.

Notes & alternatives:
- If you'd like automatic deploys, you can configure a GitHub Action to run `npm run build` and `firebase deploy` on push to `main`.
- Hosting is public by default. For private content or signed-in features, configure Firebase Authentication and protect endpoints.

If you want, I can scaffold a GitHub Actions workflow for automatic deploys next.