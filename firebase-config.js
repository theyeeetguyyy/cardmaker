// ============================================
// Firebase Configuration
// अखिल भारतीय माहौर ग्वारे वैश्य महासभा
// ============================================

const firebaseConfig = {
    apiKey: "AIzaSyCrjf9UyVs9q9s0x452RK5QDxyeInN4rLc",
    authDomain: "samaj-37e53.firebaseapp.com",
    projectId: "samaj-37e53",
    storageBucket: "samaj-37e53.firebasestorage.app",
    messagingSenderId: "152322233357",
    appId: "1:152322233357:web:dd78f0f33cbef749ae3144"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Firestore instance
// Data layout:
//   members/{id}      — all metadata (name, aadhaar, phone, etc.) — NO photo
//   memberPhotos/{id} — { photo: base64 }  (fetched on demand only)
//   meta/counter      — { value: number }  (atomic membership counter)
const db = firebase.firestore();
