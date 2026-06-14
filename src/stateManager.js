const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const STATE_FILE = path.join(__dirname, '../data/posted_ids.json');

class StateManager {
  constructor() {
    this.postedIds = new Set();
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const raw = fs.readFileSync(STATE_FILE, 'utf8');
        const data = JSON.parse(raw);
        this.postedIds = new Set(data.postedIds || []);
        logger.info(`State loaded: ${this.postedIds.size} previously reposted IDs`);
      } else {
        logger.info('No previous state found, starting fresh');
        this.save();
      }
    } catch (err) {
      logger.error(`Failed to load state: ${err.message}`);
      this.postedIds = new Set();
    }
  }

  save() {
    try {
      const data = {
        postedIds: [...this.postedIds],
        lastUpdated: new Date().toISOString()
      };
      fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      logger.error(`Failed to save state: ${err.message}`);
    }
  }

  hasPosted(postId) {
    return this.postedIds.has(postId);
  }

  markPosted(postId) {
    this.postedIds.add(postId);
    // Keep only last 5000 IDs to avoid file bloat
    if (this.postedIds.size > 5000) {
      const arr = [...this.postedIds];
      this.postedIds = new Set(arr.slice(arr.length - 5000));
    }
    this.save();
  }

  getCount() {
    return this.postedIds.size;
  }
}

module.exports = new StateManager();
