// Firebase web config for the todo app. Safe to commit: it only points the app at your project.
//
// Replace the block below with the one from the Firebase console
// (Project settings > General > Your apps > Web app > "Config").
// Copy ONLY the "const firebaseConfig = { ... };" block as Firebase shows it,
// not the import lines or the initializeApp lines.
const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "PASTE_YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID"
};

// Optional: the address of your calendar Worker (ends in .workers.dev), so you never have to type it.
// Leave it empty to enter it in the app's Calendar window instead.
const CALENDAR_FEED_URL = "";
