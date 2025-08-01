declare global {
  namespace NodeJS {
    interface ProcessEnv {
      EXPO_PUBLIC_SUPABASE_URL: string;
      EXPO_PUBLIC_SUPABASE_ANON_KEY: string;
      GOOGLE_API_KEY?: string;
      OPENAI_API_KEY?: string;
    }
  }
}

// Ensure this file is treated as a module
export {};