import admin from "firebase-admin"

// The backend authenticates to Firebase using a SERVICE ACCOUNT — this is a
// completely different credential from the client-side firebaseConfig used
// in your React app. It has full admin privileges and must NEVER be exposed
// to the browser or committed to git. It lives only here, as an environment
// variable, on the server.
//
// See FIREBASE_SERVICE_ACCOUNT_GUIDE.md for how to generate this.

let app

const getServiceAccount = () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON

  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON is not set. See FIREBASE_SERVICE_ACCOUNT_GUIDE.md.",
    )
  }

  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON. Make sure you pasted the " +
        "entire service account file contents as a single-line env var value.",
    )
  }
}

export const getFirebaseAdminApp = () => {
  if (app) return app

  const serviceAccount = getServiceAccount()

  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  })

  return app
}

export const getAdminFirestore = () => {
  getFirebaseAdminApp()
  return admin.firestore()
}

export const verifyFirebaseIdToken = async (idToken) => {
  getFirebaseAdminApp()
  return admin.auth().verifyIdToken(idToken)
}