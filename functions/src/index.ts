import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

/**
 * Callable function to send push notifications to specific teams or admins.
 * Requires the user to be authenticated via Firebase Auth.
 */
export const sendNotification = functions.https.onCall(async (data, context) => {
  // 1. Ensure user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be logged in to send notifications.');
  }

  const { targetType, targetId, title, body, urlPath } = data;

  if (!title || !body) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing title or body.');
  }

  const db = admin.firestore();
  let tokens: string[] = [];

  try {
    if (targetType === 'team' && targetId) {
      // Fetch FCM tokens for the specific team
      const teamDoc = await db.collection('teams').doc(targetId).get();
      if (teamDoc.exists) {
        const teamData = teamDoc.data();
        if (teamData && teamData.fcmTokens) {
          tokens = Object.keys(teamData.fcmTokens);
        }
      }
    } else if (targetType === 'admins') {
      // Fetch FCM tokens for admins
      const adminDoc = await db.collection('config').doc('admin_fcm_tokens').get();
      if (adminDoc.exists) {
        const adminData = adminDoc.data();
        if (adminData && adminData.tokens) {
          tokens = Object.keys(adminData.tokens);
        }
      }
    } else {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid target type.');
    }

    if (tokens.length === 0) {
      console.log(`No tokens found for target ${targetType} - ${targetId}`);
      return { success: true, deliveredCount: 0 };
    }

    // Prepare the FCM payload
    const message: admin.messaging.MulticastMessage = {
      notification: {
        title,
        body,
      },
      tokens,
      webpush: {
        fcmOptions: {
          link: urlPath ? `https://efcoop.web.app${urlPath}` : 'https://efcoop.web.app',
        },
      },
    };

    // Send the message
    const response = await admin.messaging().sendEachForMulticast(message);
    
    console.log(`Successfully sent message to ${response.successCount} devices. Failed: ${response.failureCount}`);

    // Clean up invalid tokens
    if (response.failureCount > 0) {
      const failedTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
        }
      });
      console.log('Cleaning up invalid tokens:', failedTokens);
      
      const FieldValue = admin.firestore.FieldValue;
      failedTokens.forEach(async (token) => {
        if (targetType === 'team') {
          await db.collection('teams').doc(targetId).set({
            fcmTokens: {
              [token]: FieldValue.delete()
            }
          }, { merge: true });
        } else if (targetType === 'admins') {
          await db.collection('config').doc('admin_fcm_tokens').set({
            tokens: {
              [token]: FieldValue.delete()
            }
          }, { merge: true });
        }
      });
    }

    return { success: true, deliveredCount: response.successCount };
  } catch (error: any) {
    console.error('Error sending notification:', error);
    throw new functions.https.HttpsError('internal', error.message || 'An error occurred while sending the notification.');
  }
});
