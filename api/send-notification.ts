import type { VercelRequest, VercelResponse } from '@vercel/node';
import webpush from 'web-push';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin (uses service account or default credentials)
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL || 'admin@example.com'}`,
  process.env.VITE_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Basic auth check — only allow calls from our app
  const authHeader = req.headers.authorization;
  const expectedSecret = process.env.NOTIFICATION_SECRET;
  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { targetType, targetId, title, body, urlPath = '/' } = req.body;

  if (!title || !body || !targetType) {
    return res.status(400).json({ error: 'Missing title, body or targetType.' });
  }

  let subscriptions: webpush.PushSubscription[] = [];

  try {
    if (targetType === 'team' && targetId) {
      // Fetch subscriptions for a specific team
      const teamDoc = await db.collection('teams').doc(targetId).get();
      if (teamDoc.exists) {
        const data = teamDoc.data();
        if (data?.pushSubscriptions) {
          subscriptions = Object.values(data.pushSubscriptions) as webpush.PushSubscription[];
        }
      }
    } else if (targetType === 'admins') {
      // Fetch admin subscriptions
      const adminDoc = await db.collection('config').doc('admin_push_subscriptions').get();
      if (adminDoc.exists) {
        const data = adminDoc.data();
        if (data?.subscriptions) {
          subscriptions = Object.values(data.subscriptions) as webpush.PushSubscription[];
        }
      }
    } else {
      return res.status(400).json({ error: 'Invalid targetType.' });
    }
  } catch (err) {
    console.error('Firestore read error:', err);
    return res.status(500).json({ error: 'Failed to read subscriptions.' });
  }

  if (subscriptions.length === 0) {
    return res.status(200).json({ success: true, sent: 0, message: 'No subscriptions found.' });
  }

  const payload = JSON.stringify({ title, body, urlPath });
  const failedEndpoints: string[] = [];
  let successCount = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, payload);
        successCount++;
      } catch (err: any) {
        console.warn('Failed to send to subscription:', err.message);
        if (err.statusCode === 404 || err.statusCode === 410) {
          // Subscription expired — remove it
          failedEndpoints.push(sub.endpoint);
        }
      }
    })
  );

  // Clean up expired subscriptions
  if (failedEndpoints.length > 0) {
    const endpointKey = (ep: string) => ep.replace(/[^a-zA-Z0-9]/g, '_').slice(-64);
    try {
      if (targetType === 'team' && targetId) {
        const updates: Record<string, FirebaseFirestore.FieldValue> = {};
        failedEndpoints.forEach(ep => {
          updates[`pushSubscriptions.${endpointKey(ep)}`] = getFirestore().app.options as any;
        });
        // Use FieldValue.delete() 
        const { FieldValue } = await import('firebase-admin/firestore');
        const deleteUpdates: Record<string, any> = {};
        failedEndpoints.forEach(ep => {
          deleteUpdates[`pushSubscriptions.${endpointKey(ep)}`] = FieldValue.delete();
        });
        await db.collection('teams').doc(targetId).update(deleteUpdates);
      } else if (targetType === 'admins') {
        const { FieldValue } = await import('firebase-admin/firestore');
        const deleteUpdates: Record<string, any> = {};
        failedEndpoints.forEach(ep => {
          deleteUpdates[`subscriptions.${endpointKey(ep)}`] = FieldValue.delete();
        });
        await db.collection('config').doc('admin_push_subscriptions').update(deleteUpdates);
      }
    } catch (cleanupErr) {
      console.warn('Cleanup error:', cleanupErr);
    }
  }

  return res.status(200).json({ success: true, sent: successCount });
}
