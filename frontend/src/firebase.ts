import { initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"

// VITE_ から始まる変数はクライアントサイドに公開される。.env.localに値を記載
// import.meta.env で変数を取得
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// app を通してauthなどのfirebaseの機能を使用する
export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
