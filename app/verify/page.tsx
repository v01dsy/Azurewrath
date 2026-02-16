//app/verify/page.tsx

"use client";
import { useState, useEffect, Suspense } from "react";
import RobloxAuthSection from "../../components/RobloxAuthSection";
import { useSearchParams } from "next/navigation";
import { setUserSession } from "../../lib/userSession";

// PKCE helper functions
function base64URLEncode(arrayBuffer: ArrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function sha256(plain: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return await crypto.subtle.digest('SHA-256', data);
}

async function generatePKCE() {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const codeVerifier = base64URLEncode(randomBytes.buffer);
  
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64URLEncode(hashed);
  
  return { codeVerifier, codeChallenge };
}

function VerifyContent() {
  const [method, setMethod] = useState<"bio" | "roblox" | null>(null);
  const [oauthStatus, setOauthStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [oauthError, setOauthError] = useState('');
  const searchParams = useSearchParams();

  useEffect(() => {
    // Check if we're returning from OAuth
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      const errorMessages: Record<string, string> = {
        invalid_state: "Security verification failed. Please try again.",
        no_code: "Authorization code not received. Please try again.",
        oauth_failed: "OAuth authentication failed. Please try again.",
      };
      setOauthStatus('error');
      setOauthError(errorMessages[error] || "An error occurred. Please try again.");
      alert(errorMessages[error] || "An error occurred. Please try again.");
      return;
    }

    if (code && state) {
      setMethod('roblox');
      handleOAuthCallback(code, state);
    }
  }, [searchParams]);

  const handleOAuthCallback = async (code: string, state: string) => {
    setOauthStatus('loading');
    
    const storedState = sessionStorage.getItem('oauth_state');
    const codeVerifier = sessionStorage.getItem('code_verifier');

    if (state !== storedState) {
      setOauthStatus('error');
      setOauthError('Invalid state parameter - security check failed');
      alert('Security verification failed. Please try again.');
      return;
    }

    if (!codeVerifier) {
      setOauthStatus('error');
      setOauthError('Missing code verifier');
      alert('Verification data missing. Please try again.');
      return;
    }

    try {
      const response = await fetch('/api/auth/roblox/callback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          code_verifier: codeVerifier,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Token exchange failed');
      }

      const data = await response.json();
      
      // Clear the stored values
      sessionStorage.removeItem('oauth_state');
      sessionStorage.removeItem('code_verifier');
      
      // Store user in localStorage using your existing system
      setUserSession(data.user);
      
      setOauthStatus('success');
      console.log('User logged in:', data.user);
      
      // Redirect to home page after 1.5 seconds
      setTimeout(() => {
        window.location.href = '/';
      }, 1500);
      
    } catch (error) {
      setOauthStatus('error');
      const errorMsg = error instanceof Error ? error.message : 'OAuth verification failed';
      setOauthError(errorMsg);
      alert(`Verification failed: ${errorMsg}`);
      console.error(error);
    }
  };

  const handleRobloxLogin = async () => {
    try {
      const { codeVerifier, codeChallenge } = await generatePKCE();
      const state = Math.random().toString(36).substring(2, 15);

      // Store in sessionStorage (client-side only)
      sessionStorage.setItem('code_verifier', codeVerifier);
      sessionStorage.setItem('oauth_state', state);

      // Build authorization URL
      const authUrl = new URL('https://apis.roblox.com/oauth/v1/authorize');
      authUrl.searchParams.append('client_id', process.env.NEXT_PUBLIC_ROBLOX_CLIENT_ID!);
      authUrl.searchParams.append('redirect_uri', process.env.NEXT_PUBLIC_APP_URL + '/verify');
      authUrl.searchParams.append('scope', 'openid profile');
      authUrl.searchParams.append('response_type', 'code');
      authUrl.searchParams.append('state', state);
      authUrl.searchParams.append('code_challenge', codeChallenge);
      authUrl.searchParams.append('code_challenge_method', 'S256');

      // Redirect to Roblox
      window.location.href = authUrl.toString();
    } catch (error) {
      console.error('Error initiating login:', error);
      alert('Failed to initiate Roblox login. Please try again.');
    }
  };

  return (
    <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-8 w-full max-w-md shadow-lg">
      <h1 className="text-3xl font-bold text-white mb-4 text-center">Verify Your Roblox Account</h1>
      
      {oauthStatus === 'loading' ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-blue-200">Verifying your Roblox account...</p>
        </div>
      ) : oauthStatus === 'success' ? (
        <div className="text-center py-8">
          <div className="text-green-500 text-5xl mb-4">✓</div>
          <p className="text-green-200 text-xl font-semibold">Successfully verified!</p>
          <p className="text-slate-400 text-sm mt-2">Redirecting to home page...</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4 mb-6">
            <button
              className={`px-6 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 transition-all duration-200 shadow-lg ${method === "bio" ? "ring-2 ring-purple-400" : ""}`}
              onClick={() => setMethod("bio")}
            >
              Verify via Roblox Bio
            </button>
            <button
              className={`px-6 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 transition-all duration-200 shadow-lg ${method === "roblox" ? "ring-2 ring-blue-400" : ""}`}
              onClick={() => setMethod("roblox")}
            >
              Verify via Roblox OAuth
            </button>
          </div>
          
          {method === null && (
            <div className="text-purple-200 text-center">Choose a verification method above.</div>
          )}
          
          {method === "bio" && (
            <div className="mt-4">
              <h2 className="text-xl font-bold text-white mb-2">Bio Verification</h2>
              <p className="text-purple-200 mb-2">this kih don't trust me 😹</p>
              <RobloxAuthSection />
            </div>
          )}
          
          {method === "roblox" && (
            <div className="mt-4">
              <h2 className="text-xl font-bold text-white mb-2">Roblox OAuth</h2>
              <p className="text-blue-200 mb-4">
                Securely verify your account using Roblox's official login system.
              </p>
              {oauthStatus === 'error' && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg">
                  <p className="text-red-200 text-sm">{oauthError}</p>
                </div>
              )}
              <button
                onClick={handleRobloxLogin}
                className="w-full px-6 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 transition-all duration-200 shadow-lg"
              >
                Login with Roblox
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      <Suspense fallback={
        <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-8 w-full max-w-md shadow-lg">
          <div className="text-white text-center">Loading...</div>
        </div>
      }>
        <VerifyContent />
      </Suspense>
    </div>
  );
}