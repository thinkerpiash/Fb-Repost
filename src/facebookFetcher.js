const axios = require('axios');
const Parser = require('rss-parser');
const logger = require('./logger');

const GRAPH_API_BASE = 'https://graph.facebook.com/v19.0';

class FacebookFetcher {
  constructor(sourcePageId, accessToken) {
    this.sourcePageId = sourcePageId;
    this.accessToken = accessToken;
    this.rssParser = new Parser();
  }

  /**
   * Fetches recent public posts from the source page.
   * Only public posts can be retrieved without a token.
   */
  async fetchRecentPosts(limit = 10) {
    const rssUrl = process.env.SOURCE_RSS_FEED_URL;
    if (rssUrl) {
      return await this.fetchRecentPostsFromRSS(rssUrl, limit);
    }

    try {
      const url = `${GRAPH_API_BASE}/${this.sourcePageId}/posts`;
      const params = {
        fields: [
          'id',
          'message',
          'story',
          'full_picture',
          'attachments{type,media,subattachments,url}',
          'created_time',
          'permalink_url'
        ].join(','),
        limit,
        access_token: this.accessToken
      };

      logger.debug(`Fetching posts from page: ${this.sourcePageId}`);
      const response = await axios.get(url, { params, timeout: 15000 });
      const posts = response.data.data || [];
      logger.info(`Fetched ${posts.length} posts from source page`);
      return posts;

    } catch (err) {
      if (err.response) {
        const fbError = err.response.data?.error;
        logger.error(`Facebook API error: ${fbError?.message || err.response.status}`);
        if (fbError?.code === 190) {
          logger.error('Token expired or invalid!');
        }
      } else {
        logger.error(`Network error fetching posts: ${err.message}`);
      }
      return [];
    }
  }

  /**
   * Detects the post type
   */
  detectPostType(post) {
    const attachments = post.attachments?.data || [];
    if (attachments.length === 0) return 'text';

    const firstAttach = attachments[0];
    const type = firstAttach.type;

    if (type === 'video_inline' || type === 'video_autoplay' || type === 'video_share_youtube_link') {
      return 'video';
    }
    if (type === 'album' || type === 'photo') {
      return 'photo';
    }
    if (type === 'share') {
      return 'share';
    }
    return 'text';
  }

  /**
   * Extracts media URLs from the post
   */
  extractMediaUrls(post) {
    const result = { images: [], videoUrl: null, thumbnailUrl: null };
    const attachments = post.attachments?.data || [];

    if (attachments.length === 0) {
      if (post.full_picture) result.images.push(post.full_picture);
      return result;
    }

    for (const attach of attachments) {
      // Single photo
      if (attach.type === 'photo' && attach.media?.image?.src) {
        result.images.push(attach.media.image.src);
      }

      // Album (multiple photos)
      if (attach.type === 'album') {
        const subItems = attach.subattachments?.data || [];
        for (const sub of subItems) {
          if (sub.media?.image?.src) {
            result.images.push(sub.media.image.src);
          }
        }
      }

      // Video
      if (['video_inline', 'video_autoplay'].includes(attach.type)) {
        result.videoUrl = attach.media?.source || attach.url;
        result.thumbnailUrl = attach.media?.image?.src || post.full_picture;
      }
    }

    // Fallback: full_picture
    if (result.images.length === 0 && !result.videoUrl && post.full_picture) {
      result.images.push(post.full_picture);
    }

    return result;
  }

  /**
   * Extracts caption/text from the post
   */
  extractCaption(post) {
    return post.message || post.story || '';
  }

  /**
   * Fetches and parses posts from a public RSS feed URL
   */
  async fetchRecentPostsFromRSS(rssUrl, limit = 10) {
    try {
      logger.debug(`Fetching posts from RSS Feed: ${rssUrl}`);
      const feed = await this.rssParser.parseURL(rssUrl);
      const items = feed.items || [];
      logger.info(`Fetched ${items.length} posts from RSS feed`);

      // Slice items to the limit
      const recentItems = items.slice(0, limit);

      const posts = recentItems.map(item => {
        const id = this.extractPostIdFromRssItem(item);
        const caption = item.contentSnippet || item.title || '';
        const media = this.extractMediaFromRssItem(item);

        return {
          id,
          message: caption,
          created_time: item.isoDate || item.pubDate || new Date().toISOString(),
          permalink_url: item.link,
          attachments: {
            data: media.attachments
          },
          full_picture: media.fullPicture
        };
      });

      return posts;
    } catch (err) {
      logger.error(`Error fetching posts from RSS feed: ${err.message}`);
      return [];
    }
  }

  /**
   * Tries to extract a unique post ID from RSS item link
   */
  extractPostIdFromRssItem(item) {
    const link = item.link || item.guid || '';
    try {
      if (link.includes('story_fbid=')) {
        const url = new URL(link);
        const fbid = url.searchParams.get('story_fbid');
        if (fbid) return fbid;
      }
      const parts = link.split('/');
      const lastPart = parts[parts.length - 1];
      if (lastPart && /^\d+$/.test(lastPart)) {
        return lastPart;
      }
    } catch (err) {
      logger.debug(`Error extracting post ID from RSS item link: ${err.message}`);
    }
    return item.guid || link.split('?')[0] || `rss_${Date.now()}`;
  }

  /**
   * Extracts images/videos from RSS item enclosures or HTML content
   */
  extractMediaFromRssItem(item) {
    const result = { attachments: [], fullPicture: null };
    const content = item.content || item.description || '';

    // 1. Check for media enclosure
    if (item.enclosure && item.enclosure.url) {
      const isImg = item.enclosure.type && item.enclosure.type.startsWith('image/');
      const isVid = item.enclosure.type && item.enclosure.type.startsWith('video/');
      if (isImg) {
        result.attachments.push({
          type: 'photo',
          media: { image: { src: item.enclosure.url } }
        });
        result.fullPicture = item.enclosure.url;
      } else if (isVid) {
        result.attachments.push({
          type: 'video_inline',
          media: { source: item.enclosure.url }
        });
      }
    }

    // 2. Parse img tags inside HTML content
    const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
    let match;
    while ((match = imgRegex.exec(content)) !== null) {
      const url = match[1];
      if (url && !url.includes('tracking') && !result.attachments.some(a => a.media?.image?.src === url)) {
        result.attachments.push({
          type: 'photo',
          media: { image: { src: url } }
        });
        if (!result.fullPicture) {
          result.fullPicture = url;
        }
      }
    }

    // If multiple photos, group them as an album
    if (result.attachments.length > 1) {
      const albumSubattachments = result.attachments.map(att => ({
        media: { image: { src: att.media.image.src } }
      }));
      result.attachments = [{
        type: 'album',
        subattachments: {
          data: albumSubattachments
        }
      }];
    }

    return result;
  }
}

module.exports = FacebookFetcher;
