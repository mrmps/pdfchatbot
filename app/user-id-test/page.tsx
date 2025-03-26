'use client';

import { useState, useEffect } from 'react';
import { getUserId } from '@/lib/user-id';
import { Button } from '@/components/ui/button';

export default function UserIdTestPage() {
  const [userId, setUserId] = useState<string>('');
  const [result, setResult] = useState<{ success?: boolean; message?: string; receivedUserId?: string; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchUserId() {
      try {
        const id = await getUserId();
        setUserId(id);
      } catch (error) {
        console.error('Error fetching user ID:', error);
        setUserId('Error fetching user ID');
      }
    }
    
    fetchUserId();
  }, []);

  const testUserIdApi = async () => {
    setLoading(true);
    setResult(null);
    
    try {
      const response = await fetch('/api/user-id-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });
      
      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error('Error testing user ID API:', error);
      setResult({ 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-4">User ID Test</h1>
      
      <div className="mb-6 p-4 bg-gray-100 rounded">
        <p className="font-medium">Client-side User ID:</p>
        <code className="block mt-2 p-2 bg-white rounded">{userId || 'Loading...'}</code>
      </div>
      
      <Button 
        onClick={testUserIdApi}
        disabled={loading}
        className="mb-4"
      >
        {loading ? 'Testing...' : 'Test User ID API'}
      </Button>
      
      {result && (
        <div className={`mt-6 p-4 rounded ${result.success ? 'bg-green-100' : 'bg-red-100'}`}>
          <h2 className="font-bold mb-2">{result.success ? 'Success!' : 'Error!'}</h2>
          
          {result.message && <p className="mb-2">{result.message}</p>}
          
          {result.receivedUserId && (
            <div className="mt-4">
              <p className="font-medium">Received User ID on Server:</p>
              <code className="block mt-2 p-2 bg-white rounded">{result.receivedUserId}</code>
            </div>
          )}
          
          {result.error && (
            <div className="mt-4">
              <p className="font-medium">Error:</p>
              <code className="block mt-2 p-2 bg-white rounded">{result.error}</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 