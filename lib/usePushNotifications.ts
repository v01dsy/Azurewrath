'use client';

import { useState, useEffect } from 'react';
import { getUserSession } from '@/lib/userSession';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermission>('default');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.warn('⚠️ Push notifications not supported in this browser');
      setPermission('unsupported');
      return;
    }
    const currentPermission = Notification.permission as PushPermission;
    console.log('🔔 Initial notification permission:', currentPermission);
    setPermission(currentPermission);
  }, []);

  const subscribe = async () => {
    const user = getUserSession();
    if (!user) {
      console.error('❌ No user session found');
      return;
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.error('❌ Push notifications not supported in this browser');
      alert('Push notifications are not supported in this browser.');
      return;
    }

    if (!VAPID_PUBLIC_KEY) {
      console.error('❌ VAPID_PUBLIC_KEY not configured');
      alert('Push notifications are not properly configured. Missing VAPID_PUBLIC_KEY.');
      return;
    }

    setLoading(true);
    try {
      console.log('🔔 Step 1: Registering service worker...');
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      console.log('✅ Service worker registered:', registration);

      console.log('🔔 Step 2: Requesting notification permission...');
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);
      console.log('✅ Permission result:', perm);
      
      if (perm !== 'granted') {
        console.warn('⚠️ Notification permission denied by user');
        return;
      }

      console.log('🔔 Step 3: Subscribing to push notifications...');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      console.log('✅ Push subscription created');
      console.log('   Endpoint:', subscription.endpoint);

      console.log('🔔 Step 4: Saving subscription to database...');
      const response = await fetch('/api/user/push-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.robloxUserId,
          subscription: subscription.toJSON(),
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Failed to save subscription:', errorText);
        throw new Error(`Failed to save subscription: ${errorText}`);
      }
      
      console.log('✅ Subscription saved to database');
      console.log('🎉 Push notifications enabled successfully!');
    } catch (err) {
      console.error('❌ Push subscription error:', err);
      alert(`Failed to enable push notifications:\n${err instanceof Error ? err.message : String(err)}\n\nCheck the browser console for details.`);
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async () => {
    setLoading(true);
    try {
      console.log('🔔 Unsubscribing from push notifications...');
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      if (!registration) {
        console.warn('⚠️ No service worker registration found');
        return;
      }

      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        console.warn('⚠️ No active push subscription found');
        return;
      }

      const endpoint = subscription.endpoint;
      console.log('🔔 Unsubscribing endpoint:', endpoint);
      
      await subscription.unsubscribe();
      console.log('✅ Unsubscribed from push');

      console.log('🔔 Removing subscription from database...');
      const response = await fetch('/api/user/push-subscription', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });

      if (!response.ok) {
        console.warn('⚠️ Failed to remove subscription from database:', await response.text());
      } else {
        console.log('✅ Subscription removed from database');
      }

      setPermission('default');
      console.log('🎉 Successfully unsubscribed from push notifications');
    } catch (err) {
      console.error('❌ Unsubscribe error:', err);
    } finally {
      setLoading(false);
    }
  };

  return { permission, loading, subscribe, unsubscribe };
}