import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// The user will replace these with their own config
const firebaseConfig = {
  apiKey: "AIzaSyBf9LDUpyj0RChzWSkl7Naljt4LJJOIuhA",
  authDomain: "family-chat-df6a2.firebaseapp.com",
  projectId: "family-chat-df6a2",
  storageBucket: "family-chat-df6a2.firebasestorage.app",
  messagingSenderId: "670704390482",
  appId: "1:670704390482:web:e99f6e359e5f054245ea8b"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

export { db };
