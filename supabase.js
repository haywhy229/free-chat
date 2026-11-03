

const SUPABASE_URL =  "https://pxdyqsddzmmnzfeppcyt.supabase.co";
const SUPABASE_ANON_KEY = 
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4ZHlxc2Rkem1tbnpmZXBwY3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNjM2MDgsImV4cCI6MjEwMjYzOTYwOH0.9dggJQWIkw6XIGySuuvtmwOvMv_Iq_usnfqlWPQaVhw";


const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

window.supabaseClient = supabaseClient;