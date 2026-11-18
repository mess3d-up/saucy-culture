import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const SUPER_ADMIN_EMAIL = 'spiritofhinduism@gmail.com';

export async function signInWithGoogle(): Promise<void> {
  await signInWithPopup(auth, googleProvider);
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export async function getAdminIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Must be signed in with Google to access admin.');
  }
  return user.getIdToken();
}
