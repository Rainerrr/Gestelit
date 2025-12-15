# Vercel Deployment Checklist

After deploying your Next.js app to Vercel, you need to configure the following:

## 🔐 Required Environment Variables

Set these in your Vercel project settings (Settings → Environment Variables):

### 1. Supabase Configuration (Required)

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

**Where to find these:**
- Go to your Supabase project dashboard
- Settings → API
- Copy:
  - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
  - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ **Keep this secret!**

### 2. Admin Password (Required)

```
ADMIN_PASSWORD=your-secure-admin-password
```

**Important:**
- This is the password admins use to access the admin dashboard
- Choose a strong password (at least 8 characters recommended)
- This is different from your Supabase credentials
- **Do NOT commit this to Git** - it should only be in Vercel environment variables

## 📊 Database Migrations

After setting environment variables, you need to run the RLS (Row Level Security) migration:

### Option 1: Using Supabase CLI (Recommended)

1. Install Supabase CLI if you haven't:
   ```bash
   npm install -g supabase
   ```

2. Link to your Supabase project:
   ```bash
   supabase link --project-ref your-project-ref
   ```

3. Push the migration:
   ```bash
   supabase db push
   ```

### Option 2: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open the file: `supabase/migrations/20251215112227_enable_rls_policies.sql`
4. Copy the entire SQL content
5. Paste it into the SQL Editor and click **Run**

## ✅ Verification Steps

After deployment, verify everything works:

### 1. Test Worker Login
- Visit your deployed site
- Try logging in as a worker
- Should work if Supabase env vars are correct

### 2. Test Admin Access
- Click "כניסת מנהל" (Admin Login)
- Enter the password you set in `ADMIN_PASSWORD`
- Should grant access to admin dashboard

### 3. Test Admin Dashboard
- Should see all active sessions
- Should see session history
- Should be able to view/edit workers, stations, etc.

### 4. Check Console for Errors
- Open browser DevTools (F12)
- Check Console tab for any errors
- Common issues:
  - Missing env vars → Check Vercel environment variables
  - RLS blocking access → Run database migration
  - CORS errors → Check Supabase project settings

## 🔄 Updating Admin Password

If you need to change the admin password:

1. **Update in Vercel:**
   - Go to Vercel project → Settings → Environment Variables
   - Update `ADMIN_PASSWORD` value
   - Redeploy (or wait for next deployment)

2. **Note:** The password change dialog in the admin UI will show a message that you need to update the environment variable manually. This is expected - you must update it in Vercel.

## 🚨 Troubleshooting

### "Missing required environment variable" Error

**Solution:** Make sure all 4 environment variables are set in Vercel:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PASSWORD`

### Admin Login Not Working

**Check:**
1. Is `ADMIN_PASSWORD` set correctly in Vercel?
2. Did you redeploy after setting the env var?
3. Check browser console for error messages

### "UNAUTHORIZED" Errors in Admin Dashboard

**Check:**
1. Is `SUPABASE_SERVICE_ROLE_KEY` set correctly?
2. Did you run the RLS migration?
3. Check Vercel function logs for detailed errors

### Workers Can't Access Their Sessions

**Check:**
1. Is `NEXT_PUBLIC_SUPABASE_ANON_KEY` set correctly?
2. Did you run the RLS migration?
3. RLS policies should allow workers to access their own sessions

## 📝 Environment Variable Summary

| Variable | Type | Where Used | Required |
|----------|------|------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Frontend & API | ✅ Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Frontend (browser) | ✅ Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | API routes only | ✅ Yes |
| `ADMIN_PASSWORD` | **Secret** | Admin authentication | ✅ Yes |

## 🔒 Security Notes

1. **Never commit secrets to Git:**
   - `SUPABASE_SERVICE_ROLE_KEY` - Keep secret!
   - `ADMIN_PASSWORD` - Keep secret!
   - These are already in `.gitignore`

2. **Public variables (safe to expose):**
   - `NEXT_PUBLIC_SUPABASE_URL` - Public by design
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Public by design (protected by RLS)

3. **RLS Protection:**
   - Even if someone gets the anon key, RLS policies protect your data
   - Service role key should NEVER be exposed to the frontend

## 🎯 Quick Start Checklist

- [ ] Set `NEXT_PUBLIC_SUPABASE_URL` in Vercel
- [ ] Set `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel
- [ ] Set `SUPABASE_SERVICE_ROLE_KEY` in Vercel
- [ ] Set `ADMIN_PASSWORD` in Vercel
- [ ] Run RLS migration in Supabase
- [ ] Test worker login
- [ ] Test admin login
- [ ] Verify admin dashboard works
- [ ] Check for console errors

---

**Need help?** Check the main [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for more details.

