// HUB SHIM — the hub's firebase.ts exports db/auth and lazy loaders.
// Studio only touches Firebase through src/studio/data/firestoreRepo.ts.
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getAuth, type Auth } from 'firebase/auth'
import { DEMO } from './demo'

let app: FirebaseApp | null = null
if (!DEMO) {
  app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  })
}
export const db = (app ? getFirestore(app) : null) as Firestore
export const auth = (app ? getAuth(app) : null) as Auth

export async function loadStorage() {
  const { getStorage } = await import('firebase/storage')
  return getStorage(app!)
}

export async function callFunction<Req, Res>(name: string, data: Req): Promise<Res> {
  const { getFunctions, httpsCallable } = await import('firebase/functions')
  const fn = httpsCallable<Req, Res>(getFunctions(app!, 'us-east1'), name)
  return (await fn(data)).data
}
