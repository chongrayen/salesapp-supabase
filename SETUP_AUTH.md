# Setting Up Supabase Authentication

This guide will help you configure authentication for your SalesApp using Supabase.

## Overview

The app uses **invite-only authentication** - only pre-approved users can log in. This is ideal for business/internal applications where you want to control access.

## Prerequisites

- A Supabase project (create one at [supabase.com](https://supabase.com))
- Your app already deployed on Render

## Step 1: Configure Supabase Authentication

1. **Go to your Supabase project dashboard**

2. **Disable public signups (Important!):**
   - Navigate to **Authentication** → **Providers**
   - Click on **Email** provider
   - **Uncheck** "Enable Email Signup" (this prevents anyone from creating an account)
   - Keep "Enable Email Login" checked
   - Click **Save**

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

## Step 3: Add Users (Admin Only)

Since public signups are disabled, you need to manually add users:

1. **Go to Authentication → Users in Supabase**

2. **Click "Invite user"**

3. **Enter the user's email address** and click **Send invite**

4. The user will receive an email with:
   - A link to set their password
   - Instructions to complete their account setup

5. **After setting password**, they can log in to the app

## Step 4: Test the Authentication

1. **As admin:**
   - Open your app URL
   - You should see the login screen
   - Log in with your credentials
   - You should see the main app with your email displayed and a logout button

2. **As a new user (test the invite flow):**
   - Invite yourself using the steps above
   - Check your email and click the invite link
   - Set your password
   - Log in to the app

## Managing Users

### Adding New Users
1. Go to **Authentication** → **Users** in Supabase
2. Click **Invite user**
3. Enter their email address
4. They'll receive an invite email

### Removing Users
1. Go to **Authentication** → **Users** in Supabase
2. Find the user in the list
3. Click the three dots (⋮) next to their name
4. Select **Delete user**

### Resetting Passwords
Users can reset their own passwords by clicking "Forgot password?" on the login screen (if enabled), or you can reset it for them:
1. Go to **Authentication** → **Users**
2. Click the three dots (⋮) next to the user
3. Select **Send password reset email**

## Troubleshooting

### Login button does nothing / No response
1. **Open browser developer console** (F12 or right-click → Inspect → Console)
2. **Check for errors** - Look for any red error messages
3. **Check if Supabase is configured**:
   - Type `window.__SUPABASE_URL__` in console - should show your Supabase URL
   - Type `window.__SUPABASE_ANON_KEY__` - should show your anon key
   - If these are empty, the environment variables are not set correctly in Render

### Login not working / App shows without login
- Check that `SUPABASE_URL` and `SUPABASE_ANON_KEY` are correctly set in Render
- Verify your Supabase project URL is correct (should end with `.supabase.co`)
- Make sure Email authentication is enabled in Supabase

### User can't log in after being invited
- Check if they completed the invite process (set their password)
- Verify the invite hasn't expired (default: 7 days)
- Check if their account is confirmed in Supabase

### "Authentication is not configured" error
- The `SUPABASE_ANON_KEY` environment variable is missing or empty
- Add it to Render and redeploy

### Users see "Invalid login credentials"
- Double-check the email and password
- Ensure the user was properly invited and confirmed their account

## Security Notes

- The `SUPABASE_ANON_KEY` is safe to use in frontend code - it's meant to be public
- The `SUPABASE_SERVICE_ROLE_KEY` should never be exposed to the frontend
- Consider setting up Row Level Security (RLS) in Supabase for additional data protection
- Monitor authentication logs in Supabase dashboard
- Regularly review your user list and remove inactive accounts

## Additional Configuration

### Password Requirements
By default, Supabase requires passwords to be at least 6 characters. You can customize this in:
**Authentication** → **Providers** → **Email** → **Password Settings**

### Session Management
- Sessions persist until the user logs out or the session expires
- Default session duration is 1 hour (configurable in Supabase settings)
- Auto-refresh is enabled by default

### Email Templates
Customize the invite and other emails in:
**Authentication** → **Email Templates**

### Custom Domains
If you're using a custom domain, make sure to add it to your Supabase site URL settings.