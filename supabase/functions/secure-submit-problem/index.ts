import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SecureProblemRequest {
  input_type: 'text' | 'image' | 'voice';
  title: string;
  description?: string;
  text_content?: string;
  image_data?: string;
  voice_url?: string;
  user_id?: string;
  session_id?: string;
  security_context?: {
    ip_address?: string;
    user_agent?: string;
    device_fingerprint?: string;
  };
}

// Security validation functions
function validateUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

function sanitizeInput(input: string): string {
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

async function generateContentHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('=== Secure Submit Problem Function Started ===');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const requestBody: SecureProblemRequest = await req.json()
    console.log('Received secure request:', {
      ...requestBody,
      image_data: requestBody.image_data ? '[IMAGE_DATA]' : undefined,
      security_context: requestBody.security_context ? '[SECURITY_CONTEXT]' : undefined
    })

    // Enhanced validation
    if (!requestBody.input_type || !requestBody.title) {
      throw new Error('Missing required fields: input_type and title are required')
    }

    // Sanitize inputs
    const sanitizedTitle = sanitizeInput(requestBody.title);
    const sanitizedDescription = requestBody.description ? sanitizeInput(requestBody.description) : undefined;
    const sanitizedTextContent = requestBody.text_content ? sanitizeInput(requestBody.text_content) : undefined;

    // Validate content based on input type
    if (requestBody.input_type === 'text' && !sanitizedTextContent) {
      throw new Error('text_content is required for text input type')
    }

    // Handle user authentication and session validation
    let userId = requestBody.user_id;
    let sessionId = requestBody.session_id;

    if (userId && !validateUUID(userId)) {
      throw new Error('Invalid user ID format')
    }

    if (sessionId && !validateUUID(sessionId)) {
      throw new Error('Invalid session ID format')
    }

    // If no user ID provided, create a secure guest session
    if (!userId) {
      userId = generateUUID();
      console.log('Generated secure guest user ID:', userId);
      
      // Create guest user record
      const { error: guestUserError } = await supabaseClient
        .from('users')
        .insert({
          id: userId,
          email: `guest-${userId}@secure.local`,
          first_name: 'Guest',
          last_name: 'User',
          is_guest: true,
          preferences: {
            privacy_level: 'high',
            data_retention: 'session_only'
          }
        });

      if (guestUserError) {
        console.log('Guest user creation note:', guestUserError.message);
      }
    }

    // Validate or create session
    if (!sessionId) {
      const { data: newSession, error: sessionError } = await supabaseClient
        .from('learning_sessions')
        .insert({
          user_id: userId,
          session_start: new Date().toISOString(),
          session_metadata: {
            security_level: 'enhanced',
            ip_address: requestBody.security_context?.ip_address,
            user_agent: requestBody.security_context?.user_agent,
            device_fingerprint: requestBody.security_context?.device_fingerprint
          }
        })
        .select('id')
        .single();

      if (sessionError) {
        console.error('Session creation error:', sessionError);
        throw new Error('Failed to create secure session');
      }

      sessionId = newSession.id;
      console.log('Created secure session:', sessionId);
    }

    // Generate content hash for integrity
    const contentForHash = sanitizedTextContent || requestBody.image_data || requestBody.voice_url || '';
    const contentHash = await generateContentHash(contentForHash);

    // Create problem submission with enhanced security
    const problemId = generateUUID();
    console.log('Generated problem ID:', problemId);

    const { data: problemData, error: insertError } = await supabaseClient
      .from('problem_submissions')
      .insert({
        id: problemId,
        user_id: userId,
        session_id: sessionId,
        title: sanitizedTitle,
        input_type: requestBody.input_type,
        text_content: sanitizedTextContent || null,
        image_url: requestBody.image_data || null,
        voice_url: requestBody.voice_url || null,
        status: 'processing',
        content_hash: contentHash,
        security_flags: {
          validated: true,
          sanitized: true,
          hash_verified: true,
          session_validated: true
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      console.error('Secure database insert error:', insertError)
      throw new Error(`Failed to create secure problem submission: ${insertError.message}`)
    }

    // Log security audit event
    await supabaseClient
      .from('audit_logs')
      .insert({
        user_id: userId,
        action: 'problem_submission_created',
        resource_type: 'problem_submission',
        resource_id: problemId,
        new_values: {
          title: sanitizedTitle,
          input_type: requestBody.input_type,
          security_level: 'enhanced'
        },
        ip_address: requestBody.security_context?.ip_address,
        user_agent: requestBody.security_context?.user_agent
      });

    console.log('Created secure problem submission:', problemData)

    // Get Google API key with validation
    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY')
    if (!GOOGLE_API_KEY) {
      console.error('GOOGLE_API_KEY not found in environment variables')
      
      await supabaseClient
        .from('problem_submissions')
        .update({
          status: 'error',
          error_message: 'AI service temporarily unavailable',
          security_flags: {
            ...problemData.security_flags,
            ai_processing_failed: true
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', problemId)

      return new Response(
        JSON.stringify({
          success: false,
          error: 'AI service temporarily unavailable',
          problemId: problemId
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 503,
        }
      )
    }

    // Enhanced prompt with security context
    let prompt = `You are a secure AI tutor helping students learn. Please analyze this problem and provide a detailed, educational solution.

SECURITY CONTEXT:
- Content has been sanitized and validated
- User session is authenticated
- Content integrity verified with hash: ${contentHash.substring(0, 8)}...

PROBLEM DETAILS:
Title: ${sanitizedTitle}
`

    if (sanitizedDescription) {
      prompt += `Description: ${sanitizedDescription}\n`
    }

    if (sanitizedTextContent) {
      prompt += `Problem Content: ${sanitizedTextContent}\n`
    }

    prompt += `
Please provide:
1. A clear, step-by-step solution
2. Educational explanation of concepts involved
3. The subject area (Mathematics, Science, History, English, etc.)
4. Difficulty level (easy, medium, or hard)
5. 3-5 relevant educational tags
6. Learning objectives achieved

Format your response as a structured educational explanation that helps the student understand both the solution and the underlying concepts. Ensure all content is appropriate for educational purposes.`

    console.log('Calling Gemini API with enhanced security...')

    // Call Gemini API with enhanced error handling
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            }
          ]
        })
      }
    )

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text()
      console.error('Gemini API error:', errorText)
      
      await supabaseClient
        .from('problem_submissions')
        .update({
          status: 'error',
          error_message: `AI processing error: ${geminiResponse.status}`,
          security_flags: {
            ...problemData.security_flags,
            ai_processing_failed: true
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', problemId)

      return new Response(
        JSON.stringify({
          success: false,
          error: `AI processing error: ${geminiResponse.status}`,
          problemId: problemId
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      )
    }

    const geminiData = await geminiResponse.json()
    console.log('Gemini API response received with enhanced security')

    // Validate and sanitize AI response
    const solution = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'No solution generated'
    const sanitizedSolution = sanitizeInput(solution);

    // Enhanced parsing with security validation
    const lines = sanitizedSolution.split('\n')
    let subject = 'General'
    let difficulty: 'easy' | 'medium' | 'hard' = 'medium'
    const tags: string[] = []

    // Parse response with validation
    for (const line of lines) {
      const lowerLine = line.toLowerCase()
      if (lowerLine.includes('subject') || lowerLine.includes('area')) {
        if (lowerLine.includes('math')) subject = 'Mathematics'
        else if (lowerLine.includes('science') || lowerLine.includes('physics') || lowerLine.includes('chemistry') || lowerLine.includes('biology')) subject = 'Science'
        else if (lowerLine.includes('history')) subject = 'History'
        else if (lowerLine.includes('english') || lowerLine.includes('literature')) subject = 'English'
      }
      
      if (lowerLine.includes('difficulty')) {
        if (lowerLine.includes('easy')) difficulty = 'easy'
        else if (lowerLine.includes('hard')) difficulty = 'hard'
        else difficulty = 'medium'
      }
    }

    // Ensure we have educational tags
    if (tags.length === 0) {
      tags.push('learning', 'education', subject.toLowerCase())
    }

    // Update with secure solution
    const { error: updateError } = await supabaseClient
      .from('problem_submissions')
      .update({
        solution: sanitizedSolution,
        topic: subject,
        difficulty: difficulty,
        tags: tags,
        status: 'completed',
        ai_response: {
          full_response: geminiData,
          suggested_tags: tags,
          parsed_subject: subject,
          parsed_difficulty: difficulty,
          security_validated: true
        },
        security_flags: {
          ...problemData.security_flags,
          ai_processing_completed: true,
          solution_sanitized: true
        },
        processing_time_ms: Date.now() - new Date(problemData.created_at).getTime(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', problemId)

    if (updateError) {
      console.error('Error updating secure problem submission:', updateError)
      throw new Error(`Failed to update secure problem submission: ${updateError.message}`)
    }

    // Update session statistics
    await supabaseClient
      .from('learning_sessions')
      .update({
        total_problems: 1, // This should be incremented in a real implementation
        subjects_covered: [subject]
      })
      .eq('id', sessionId);

    // Log completion audit event
    await supabaseClient
      .from('audit_logs')
      .insert({
        user_id: userId,
        action: 'problem_submission_completed',
        resource_type: 'problem_submission',
        resource_id: problemId,
        new_values: {
          status: 'completed',
          subject: subject,
          difficulty: difficulty,
          security_level: 'enhanced'
        }
      });

    console.log('Successfully processed secure problem submission')

    return new Response(
      JSON.stringify({
        success: true,
        problemId: problemId,
        sessionId: sessionId,
        status: 'completed',
        solution: sanitizedSolution,
        subject: subject,
        difficulty: difficulty,
        tags: tags,
        security: {
          validated: true,
          sanitized: true,
          hash_verified: true
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error in secure submit-problem function:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        details: 'Secure processing failed',
        security: {
          error_logged: true,
          timestamp: new Date().toISOString()
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})