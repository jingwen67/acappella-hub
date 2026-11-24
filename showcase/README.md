 # CUCAC Showcase Bubble Tea Pass

Vendor: ? Tea (Question Mark Tea) - Columbia University.

Deploy as a separate Vercel project with root directory `showcase`, framework Other, no build command. Run schema.sql once in the chosen Supabase project. Set server-only SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD, STAFF_PASSWORD, CLAIM_PIN in Vercel. Use strong distinct secrets; share claim PIN only at the event. Claiming starts closed. Routes: /, /redeem, /admin. Test claim, duplicate email, redemption, duplicate redemption, and capacity before opening. Email is self-reported, not verified; staff must supervise distribution. Do not commit secrets. Delete event personal data after the agreed retention period. No existing Hub tables are modified.
