import FingerprintJS from '@fingerprintjs/fingerprintjs';

// Initialize an agent at application startup
let fpPromise: Promise<any> | null = null;

function getFingerprint(): Promise<string> {
  if (!fpPromise) {
    // Initialize FingerprintJS only on the client side
    if (typeof window !== 'undefined') {
      fpPromise = FingerprintJS.load();
    } else {
      return Promise.resolve('server-side');
    }
  }

  return fpPromise
    .then(fp => fp.get())
    .then(result => {
      // Generate a stable user ID from the fingerprint
      return `user-${result.visitorId}`;
    })
    .catch(error => {
      console.error('Error generating fingerprint:', error);
      // Fallback to a random ID if fingerprinting fails
      return `user-${Math.random().toString(36).substring(2, 15)}`;
    });
}

// Get the user ID from localStorage or generate a new one
export async function getUserId(): Promise<string> {
  // Check if we're on the server side
  if (typeof window === 'undefined') {
    return 'server-side';
  }

  // Try to get the user ID from localStorage
  const storedUserId = localStorage.getItem('pdf-chat-user-id');
  if (storedUserId) {
    return storedUserId;
  }

  // Generate a new user ID based on fingerprint
  const newUserId = await getFingerprint();
  
  // Store the new user ID in localStorage
  localStorage.setItem('pdf-chat-user-id', newUserId);
  
  return newUserId;
} 