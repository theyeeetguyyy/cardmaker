// ============================================
// Firebase Configuration
// अखिल भारतीय माहौर ग्वारे वैश्य महासभा
// ============================================

const firebaseConfig = {
    apiKey: "AIzaSyCrjf9UyVs9q9s0x452RK5QDxyeInN4rLc",
    authDomain: "samaj-37e53.firebaseapp.com",
    databaseURL: "https://samaj-37e53-default-rtdb.firebaseio.com",
    projectId: "samaj-37e53",
    storageBucket: "samaj-37e53.firebasestorage.app",
    messagingSenderId: "152322233357",
    appId: "1:152322233357:web:dd78f0f33cbef749ae3144"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Realtime Database reference
const db = firebase.database();

// Admin password (change this!)
const ADMIN_PASSWORD = "admin123";
