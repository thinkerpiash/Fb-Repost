# Facebook Repost Bot 🤖

A tool to automatically repost public posts (images/videos/captions) from one Facebook page to another.

---

## Features

- ✅ Repost Image + Caption
- ✅ Repost Multiple Images (album)
- ✅ Repost Video + Caption (chunked upload for large videos)
- ✅ Text-only posts
- ✅ Skip duplicate posts (state tracking)
- ✅ Runs 24/7 on server with PM2
- ✅ Detailed log files

---

## Requirements

- Node.js v18+
- Facebook Page Access Token (destination page)
- Source page must be **Public**

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create .env file

```bash
cp .env.example .env
nano .env
```

Fill in the following details in the `.env` file:

```env
SOURCE_PAGE_ID=source_page_name_or_id
DEST_PAGE_ID=123456789
DEST_PAGE_ACCESS_TOKEN=EAAxxxxxxxxxx...
CHECK_INTERVAL_MINUTES=15
POSTS_PER_FETCH=10
```

### 3. How to get Page Access Token

1. Go to [Meta Developer Console](https://developers.facebook.com)
2. Go to your App → **Graph API Explorer**
3. Select the **destination page** from the "User or Page" dropdown
4. Check permissions:
   - `pages_manage_posts`
   - `pages_read_engagement`
   - `pages_show_list`
5. Copy the Token

> ⚠️ **Get a Long-lived token** (60 days):
> ```
> https://graph.facebook.com/oauth/access_token?
>   grant_type=fb_exchange_token&
>   client_id={APP_ID}&
>   client_secret={APP_SECRET}&
>   fb_exchange_token={SHORT_LIVED_TOKEN}
> ```

---

## Running

### Test it (Once)

```bash
node src/index.js
```

### Run permanently on server using PM2

```bash
# Install PM2 (Once)
npm install -g pm2

# Start the bot
pm2 start ecosystem.config.js

# Keep running after server reboot
pm2 save
pm2 startup

# Live monitoring
pm2 monit

# View logs
pm2 logs fb-repost-bot

# Stop the bot
pm2 stop fb-repost-bot

# Restart the bot
pm2 restart fb-repost-bot
```

---

## Folder Structure

```
fb-repost/
├── src/
│   ├── index.js          # Entrypoint + Scheduler
│   ├── bot.js            # Main bot logic
│   ├── facebookFetcher.js # Fetching posts from source page
│   ├── facebookPoster.js  # Posting to destination page
│   ├── mediaDownloader.js # Downloading images/videos
│   ├── stateManager.js   # Duplicate tracking
│   └── logger.js         # Logging system
├── data/
│   ├── posted_ids.json   # Records of posted IDs
│   └── temp/             # Downloaded media (auto-cleaned)
├── logs/
│   ├── bot.log           # All logs
│   └── error.log         # Errors only
├── .env.example
├── ecosystem.config.js   # PM2 config
└── package.json
```

---

## Limitations & Known Issues

| Issue | Cause | Solution |
|--------|------|--------|
| Videos not downloading | FB CDN URL expired | Post link as a fallback |
| Token expired | Expires after 60 days | Get a new long-lived token |
| Rate limit error | Posting too fast | Increase `CHECK_INTERVAL_MINUTES` |
| Posts not found | Source page is private | Page must be Public |

---

## License & Disclaimer

- Follow Facebook's [Terms of Service](https://www.facebook.com/terms)
- Consider copyright issues before reposting someone else's content
- Obtaining Meta's approval for automation is recommended
