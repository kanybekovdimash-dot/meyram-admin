# admin.apolloai.biz → Cloudflare Pages

## Squarespace DNS

Измени CNAME:
- **Host:** admin
- **Data:** `meyram-admin.pages.dev` (вместо kanybekovdimash-dot.github.io)

## Cloudflare Pages

meyram-admin → Custom domains → Add: admin.apolloai.biz → Check DNS

## Worker

ALLOWED_ORIGINS: https://admin.apolloai.biz

## Supabase

Authentication → URL Configuration:
- Site URL: https://admin.apolloai.biz
- Redirect URLs: https://admin.apolloai.biz/*
