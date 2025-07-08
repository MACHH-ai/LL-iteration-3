import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface ProblemSubmissionData {
  title: string;
  inputType: 'text' | 'image' | 'voice';
  textContent?: string;
  imageData?: string; // base64 encoded image
  voiceUrl?: string;
  description?: string;
}

export interface ProblemResult {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  solution?: string;
  explanation?: string;
  subject?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  tags?: string[];
  errorMessage?: string;
}

// Generate a valid UUID v4
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Validate UUID format
const isValidUUID = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

export function useProblemSubmission() {
  const { user, isAuthenticated } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<ProblemResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitProblem = useCallback(async (data: ProblemSubmissionData): Promise<string | null> => {
    // Reset previous state
    setError(null);
    setResult(null);

    // Validate input data
    if (!data.title.trim()) {
      setError('Problem title is required');
      return null;
    }

    if (!data.textContent?.trim() && !data.imageData && !data.voiceUrl) {
      setError('Problem content is required');
      return null;
    }

    setIsSubmitting(true);

    try {
      // Determine user ID to use
      let userId: string | undefined;
      
      if (isAuthenticated && user?.id) {
        // Validate the authenticated user's ID
        if (!isValidUUID(user.id)) {
          console.error('Invalid user ID format:', user.id);
          throw new Error('Invalid user session. Please sign in again.');
        }
        userId = user.id;
        console.log('Using authenticated user ID:', userId);
      } else if (user?.isGuest) {
        // For guest users, don't send user_id - let the Edge Function handle it
        console.log('Guest user detected, letting Edge Function assign default user ID');
        userId = undefined;
      } else {
        // Not authenticated and not a guest
        throw new Error('Please sign in to submit problems');
      }

      // Prepare request body for Edge Function
      const requestBody = {
        input_type: data.inputType,
        title: data.title.trim(),
        description: data.description?.trim(),
        text_content: data.textContent?.trim(),
        image_data: data.imageData,
        voice_url: data.voiceUrl,
        user_id: userId, // Will be undefined for guests
      };

      console.log('Submitting problem with data:', {
        ...requestBody,
        image_data: requestBody.image_data ? '[IMAGE_DATA]' : undefined,
      });

      // Call the Supabase Edge Function
      const { data: response, error: submitError } = await supabase.functions.invoke('submit-problem', {
        body: requestBody
      });

      console.log('Edge Function response:', response);
      console.log('Edge Function error:', submitError);

      if (submitError) {
        console.error('Edge Function submission error:', submitError);
        
        // Handle different types of errors
        let errorMessage = 'Failed to submit problem';
        
        if (typeof submitError === 'object' && submitError !== null) {
          if ('message' in submitError) {
            errorMessage = String(submitError.message);
          } else {
            errorMessage = JSON.stringify(submitError);
          }
        } else {
          errorMessage = String(submitError);
        }
        
        throw new Error(errorMessage);
      }

      if (!response) {
        throw new Error('No response received from server');
      }

      // Check if the response indicates an error
      if (!response.success) {
        const errorMsg = response.error || response.details || 'Unknown server error';
        console.error('Server response error:', errorMsg);
        throw new Error(`Server error: ${errorMsg}`);
      }

      if (!response.problemId) {
        throw new Error('Invalid response: missing problem ID');
      }

      // Validate the returned problem ID
      if (!isValidUUID(response.problemId)) {
        console.error('Invalid problem ID format received:', response.problemId);
        throw new Error('Invalid response format from server');
      }

      console.log('Problem submitted successfully with ID:', response.problemId);

      // Set initial result based on response
      const initialResult: ProblemResult = {
        id: response.problemId,
        status: response.status || 'pending',
        solution: response.solution,
        subject: response.subject,
        difficulty: response.difficulty,
        tags: response.tags,
      };

      setResult(initialResult);

      // If the problem is already completed, no need to poll
      if (response.status === 'completed') {
        console.log('Problem completed immediately');
        return response.problemId;
      }

      // Start polling for completion if still processing
      if (response.status === 'processing' || response.status === 'pending') {
        console.log('Starting polling for problem completion');
        pollForCompletion(response.problemId);
      }

      return response.problemId;

    } catch (err) {
      console.error('Problem submission error:', err);
      
      let errorMessage = 'Failed to submit problem';
      
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'object' && err !== null) {
        errorMessage = JSON.stringify(err);
      } else {
        errorMessage = String(err);
      }
      
      setError(errorMessage);
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [user, isAuthenticated]);

  const pollForCompletion = useCallback(async (problemId: string) => {
    const maxAttempts = 60; // 2 minutes with 2-second intervals
    let attempts = 0;

    const poll = async () => {
      try {
        console.log(`Polling attempt ${attempts + 1}/${maxAttempts} for problem ${problemId}`);
        
        // Validate problem ID before querying
        if (!isValidUUID(problemId)) {
          throw new Error('Invalid problem ID format for polling');
        }
        
        const { data, error: fetchError } = await supabase
          .from('problem_submissions')
          .select('*')
          .eq('id', problemId)
          .single();

        if (fetchError) {
          console.error('Error polling for completion:', fetchError);
          
          // Handle specific database errors
          if (fetchError.message.includes('invalid input syntax for type uuid')) {
            setError('Invalid problem ID format. Please try submitting again.');
          } else {
            setError(`Failed to check problem status: ${fetchError.message}`);
          }
          return;
        }

        if (!data) {
          console.error('No data returned for problem ID:', problemId);
          setError('Problem not found. Please try submitting again.');
          return;
        }

        console.log('Poll result for problem', problemId, ':', {
          status: data.status,
          hasSolution: !!data.solution,
        });

        // Extract error message from response if it exists
        let errorMessage: string | undefined = undefined;
        
        if (data.status === 'error') {
          if (typeof data.ai_response === 'object' && data.ai_response !== null) {
            errorMessage = data.ai_response.error || data.ai_response.message || data.error_message || 'Problem processing failed';
          } else {
            errorMessage = data.error_message || 'Problem processing failed';
          }
        }

        // Extract tags from ai_response if they exist
        let tags: string[] | undefined = undefined;
        
        if (typeof data.ai_response === 'object' && 
            data.ai_response !== null && 
            Array.isArray(data.ai_response.suggested_tags)) {
          tags = data.ai_response.suggested_tags;
        } else if (Array.isArray(data.tags)) {
          tags = data.tags;
        }

        const newResult: ProblemResult = {
          id: data.id,
          status: data.status,
          solution: data.solution || undefined,
          explanation: data.explanation || data.solution || undefined,
          subject: data.topic || data.subject || undefined,
          difficulty: data.difficulty || undefined,
          tags: tags,
          errorMessage: errorMessage,
        };

        console.log('Updating result with:', newResult);
        setResult(newResult);

        // Stop polling if completed or error
        if (data.status === 'completed' || data.status === 'error') {
          if (data.status === 'error') {
            setError(errorMessage || 'Problem processing failed');
          }
          return;
        }

        // Continue polling if not completed and within max attempts
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000);
        } else {
          console.error('Polling timeout reached for problem:', problemId);
          setError('Problem processing timed out. Please try again.');
        }
      } catch (err) {
        console.error('Polling error for problem', problemId, ':', err);
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(`Failed to check problem status: ${errorMsg}`);
      }
    };

    // Start polling after a short delay
    setTimeout(poll, 1000);
  }, []);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    submitProblem,
    isSubmitting,
    result,
    error,
    clearResult,
  };
}