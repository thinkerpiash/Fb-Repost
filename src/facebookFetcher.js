const axios = require('axios');
const logger = require('./logger');

const GRAPH_API_BASE = 'https://graph.facebook.com/v19.0';

class FacebookFetcher {
  constructor(sourcePageId, accessToken) {
    this.sourcePageId = sourcePageId;
    this.accessToken = accessToken;
  }

  /**
   * Fetches recent public posts from the source page.
   * Only public posts can be retrieved without a token.
   */
  async fetchRecentPosts(limit = 10) {
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
}

module.exports = FacebookFetcher;
