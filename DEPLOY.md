# Деплой админки на Cloudflare Pages

## Один раз

1. **Cloudflare Dashboard** → [API Tokens](https://dash.cloudflare.com/profile/api-tokens) → создай токен с правами **Cloudflare Pages — Edit** (или **Workers Pages: Edit** + **Account Settings: Read**).

2. Локально (Windows), в папке `meyram-admin` создай файл **`.cloudflare.env`** (не коммить в git):

   ```env
   CLOUDFLARE_API_TOKEN=твой_токен
   CLOUDFLARE_ACCOUNT_ID=412db0cf9cffd7b9e634b190bcbf5fed
   ```

   Можно скопировать тот же токен, что для `local-worker`, если права подходят.

3. **Первый деплой с ПК:**

   ```powershell
   cd meyram-admin
   npm install
   .\deploy.ps1
   ```

   Либо без скрипта: `npx wrangler pages deploy . --project-name=meyram-admin`

4. **Домен `admin.apolloai.biz`**  
   Cloudflare → **Workers & Pages** → проект **meyram-admin** → **Custom domains** → добавь `admin.apolloai.biz`.  
   DNS должен быть у Cloudflare (записи подскажет сам интерфейс).

## Автодеплой из GitHub

В репозитории **kanybekovdimash-dot/meyram-admin** → **Settings → Secrets and variables → Actions** добавь:

| Secret | Значение |
|--------|----------|
| `CLOUDFLARE_API_TOKEN` | API-токен с правами Pages |
| `CLOUDFLARE_ACCOUNT_ID` | `412db0cf9cffd7b9e634b190bcbf5fed` |

После этого каждый `git push` в ветку `main` запускает workflow `.github/workflows/cloudflare-pages.yml`.

## Полезное

- Файл `CNAME` в репо оставлен для совместимости; для Cloudflare главное — домен в Dashboard.
- Сборка не нужна: это чистый статик (`index.html`, `admin.js`, `admin.css`).
