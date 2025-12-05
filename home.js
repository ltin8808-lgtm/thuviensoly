// Import Firebase v12
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// Config
const firebaseConfig = {
    apiKey: "AIzaSyCmEApO83tSV9_V0ylQGIBDRNdE5587G70",
    authDomain: "thuvienvatlii-5a99d.firebaseapp.com",
    projectId: "thuvienvatlii-5a99d",
    storageBucket: "thuvienvatlii-5a99d.firebasestorage.app",
    messagingSenderId: "372139833632",
    appId: "1:372139833632:web:1a1f4c6b4219b8fe7e3f45",
    measurementId: "G-3ZSC17QBDQ"
};

// Khởi tạo
const app = initializeApp(firebaseConfig);

// Xuất Firestore cho các file khác dùng
export const db = getFirestore(app);
// Xuất Firebase Auth và helper cho Google Sign-In
export const auth = getAuth(app);

export function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    return signInWithRedirect(auth, provider);
}

export function getRedirectResultAuth() {
    return getRedirectResult(auth);
}

export function signOutUser() {
    return signOut(auth);
}
