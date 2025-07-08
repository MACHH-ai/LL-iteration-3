// TestProblemSubmission.tsx
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function TestProblemSubmission() {
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const testSubmitProblem = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      console.log('Testing submit-problem function...');
      
      // Direct call to the Edge Function
      const { data, error: functionError } = await supabase.functions.invoke('submit-problem', {
        body: {
          input_type: 'text',
          title: 'Test Problem',
          text_content: 'What is the capital of France?',
          user_id: 'test-user-id'
        }
      });
      
      console.log('Response data:', data);
      console.log('Response error:', functionError);
      
      if (functionError) {
        throw new Error(`Function error: ${JSON.stringify(functionError)}`);
      }
      
      setResult(data);
    } catch (err) {
      console.error('Test failed:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const testGeminiApi = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      console.log('Testing test-gemini function...');
      
      // Direct call to the test-gemini Edge Function
      const { data, error: functionError } = await supabase.functions.invoke('test-gemini', {
        body: {
          prompt: 'What is the capital of France?'
        }
      });
      
      console.log('Response data:', data);
      console.log('Response error:', functionError);
      
      if (functionError) {
        throw new Error(`Function error: ${JSON.stringify(functionError)}`);
      }
      
      setResult(data);
    } catch (err) {
      console.error('Test failed:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Test Problem Submission</h1>
      
      <div className="flex gap-4 mb-4">
        <button
          onClick={testSubmitProblem}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-blue-300"
        >
          {loading ? 'Testing...' : 'Test Submit Problem'}
        </button>
        
        <button
          onClick={testGeminiApi}
          disabled={loading}
          className="px-4 py-2 bg-green-500 text-white rounded disabled:bg-green-300"
        >
          {loading ? 'Testing...' : 'Test Gemini API'}
        </button>
      </div>
      
      {error && (
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded mb-4">
          <p className="font-bold">Error:</p>
          <pre className="whitespace-pre-wrap">{error}</pre>
        </div>
      )}
      
      {result && (
        <div className="p-4 bg-green-100 border border-green-400 text-green-700 rounded">
          <p className="font-bold">Result:</p>
          <pre className="whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}