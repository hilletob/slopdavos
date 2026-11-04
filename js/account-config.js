// js/account-config.js
// The optional player account. While the URL or the key is empty the game shows no account button and talks to no backend.
// The key is the project's public one (Supabase: publishable or anon key): it is meant to be in the browser, the database's
// row level security is what protects the data. The service role / secret key never goes in here or anywhere in this repo.
export const SUPABASE_URL = 'https://uakamnjzdggsghayjfpv.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_KihisJw6N3u_w08bpeFzfA_YGDMSFMD';
// Signing in is offered for these (Apple joins here once its developer account is set up)
export const LOGIN_PROVIDERS = [{ id: 'google', label: 'Sign in with Google' }];
// Pinned: loaded only for a click on "sign in" or when a session is already stored, never during a guest's start
export const SUPABASE_SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';
