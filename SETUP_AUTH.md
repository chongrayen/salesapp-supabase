# Setting Up Supabase Authentication

This guide will help you configure authentication for your SalesApp using Supabase.

## Prerequisites

- A Supabase project (create one at [supabase.com](https://supabase.com))
- Your app already deployed on Render

## Step 1: Configure Supabase Authentication

1. **Go to your Supabase project dashboard**

2. **Enable Email/Password Authentication:**
   - Navigate to **Authentication** → **Providers**
   - Enable **Email** provider
   - Optionally configure email templates under **Authentication** → **Email Templates**

3. **Get your Supabase credentials:**
   - Go to **Settings** → **API**
   - Copy the following values:
     - **Project URL** (e.g., `https://xxxxx.supabase.co`)
     - **anon/public key** (for frontend)
     - **service_role key** (for backend - keep this secret!)

## Step 2: Configure Render Environment Variables

1. **Go to your Render dashboard**

2. **Navigate to your web service**

3. **Add the following environment variables:**
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_ANON_KEY`: Your Supabase anon/public key
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (for backend operations)
   - `SUPABASE_BUCKET`: The name of your storage bucket (if using file storage)

4. **Redeploy your service** (Render should auto-deploy when env vars change)

## Step 3: Create Users

You have two options:

### Option A: Self-Registration (Enabled by default)
Users can sign up directly through the login page. They will receive a confirmation email.

### Option B: Invite-Only (More Secure)
1. Go to **Authentication** → **Users** in Supabase
2. Click **Invite user** to create accounts manually
3. Disable public signups in **Authentication** → **Providers** → **Email** settings

## Step 4: Test the Authentication

1. Open your app URL
2. You should see the login screen
3. Click "Need an account? Sign up" to create a new account
4. Check your email for confirmation (if enabled)
5. Log in with your credentials
6. You should now see the main app with your email displayed and a logout button

## Troubleshooting

### Login not working / App shows without login
- Check that `SUPABASE_URL` and `SUPABASE_ANON_KEY` are correctly set in Render
- Verify your Supabase project URL is correct (should end with `.supabase.co`)
- Make sure Email authentication is enabled in Supabase

### Users can't sign up
- Check if email confirmation is required (users need to click the link in their email)
- Verify your email templates are configured correctly in Supabase
- Check Supabase logs under **Logs** in the dashboard

### "Authentication is not configured" error
- The `SUPABASE_ANON_KEY` environment variable is missing or empty
- Add it to Render and redeploy

## Security Notes

- The `SUPABASE_ANON_KEY` is safe to use in frontend code - it's meant to be public
- The `SUPABASE_SERVICE_ROLE_KEY` should never be exposed to the frontend
- Consider setting up Row Level Security (RLS) in Supabase for additional data protection
- Monitor authentication logs in Supabase dashboard

## Additional Configuration

### Password Requirements
By default, Supabase requires passwords to be at least 6 characters. You can customize this in:
**Authentication** → **Providers** → **Email** → **Password Settings**

### Session Management
- Sessions persist until the user logs out or the session expires
- Default session duration is 1 hour (configurable in Supabase settings)
- Auto-refresh is enabled by default

### Custom Domains
If you're using a custom domain, make sure to add it to your Supabase site URL settings.