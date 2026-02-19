import { Injectable } from '@nestjs/common';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { DecodedIdToken, getAuth } from 'firebase-admin/auth';

@Injectable()
export class FirebaseAdminService {
  async verifyIdToken(token: string): Promise<DecodedIdToken> {
    const app = this.getOrInitializeApp();
    return getAuth(app).verifyIdToken(token);
  }

  private getOrInitializeApp() {
    const apps = getApps();

    if (apps.length > 0) {
      return apps[0];
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        'Missing Firebase Admin credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.',
      );
    }

    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }
}
