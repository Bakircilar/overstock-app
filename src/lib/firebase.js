// Firebase SDK'dan gerekli modülleri içe aktar
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore"; // Firestore veritabanını kullanmak için gerekli

// Firebase yapılandırması (Buraya kendi bilgilerini ekle)
const firebaseConfig = {
  apiKey: "AIzaSyDFVFI4NfZm8lnupEq4qjQDUWNpAMr6wuw",
  authDomain: "overstock-3abbe.firebaseapp.com",
  projectId: "overstock-3abbe",
  storageBucket: "overstock-3abbe.firebasestorage.app",
  messagingSenderId: "927483801178",
  appId: "1:927483801178:web:c13ef474f545d29af77263"
};

// Firebase'i başlat
const app = initializeApp(firebaseConfig);
const db = getFirestore(app); // Firestore bağlantısını başlat

// Firestore bağlantısını dışa aktar
export { db };
