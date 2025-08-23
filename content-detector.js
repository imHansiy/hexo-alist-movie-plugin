/**
 * 内容检测器 - 负责识别文件类型和媒体内容
 */

class ContentDetector {
  constructor(config = {}) {
    this.config = {
      videoExtensions: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.ts', '.m2ts'],
      moviePatterns: config.moviePatterns || [],
      tvPatterns: config.tvPatterns || [],
      seasonPatterns: config.seasonPatterns || [],
      episodePatterns: config.episodePatterns || [],
      ...config
    };
  }

  /**
   * 检查是否为视频文件
   */
  isVideoFile(filename) {
    const ext = this.getFileExtension(filename);
    return this.config.videoExtensions.includes(ext);
  }

  /**
   * 获取文件扩展名
   */
  getFileExtension(filename) {
    const match = filename.match(/\.[^.]+$/);
    return match ? match[0].toLowerCase() : '';
  }

  /**
   * 分析目录内容
   */
  analyzeDirectory(items) {
    const analysis = {
      movies: [],
      tvShows: [],
      mixed: [],
      subdirectories: [],
      files: [],
      primaryType: 'unknown'
    };

    let movieCount = 0;
    let tvCount = 0;
    let videoFileCount = 0;

    for (const item of items) {
      if (item.is_dir) {
        analysis.subdirectories.push(item);
        
        // 检查是否为季文件夹
        if (this.matchSeasonFolder(item.name)) {
          tvCount++;
          analysis.tvShows.push(item);
        } else {
          // 假设是电影文件夹
          movieCount++;
          analysis.movies.push(item);
        }
      } else {
        analysis.files.push(item);
        
        if (this.isVideoFile(item.name)) {
          videoFileCount++;
          const fileAnalysis = this.analyzeFile(item);
          
          if (fileAnalysis.type === 'movie') {
            movieCount++;
          } else if (fileAnalysis.type === 'episode') {
            tvCount++;
          }
        }
      }
    }

    // 确定主要类型
    if (movieCount > tvCount) {
      analysis.primaryType = 'movie';
    } else if (tvCount > movieCount) {
      analysis.primaryType = 'tv';
    } else if (movieCount > 0 || tvCount > 0) {
      analysis.primaryType = 'mixed';
    }

    return analysis;
  }

  /**
   * 分析单个文件
   */
  analyzeFile(file) {
    const filename = file.name;
    
    // 检查是否包含季集信息
    const seasonEpisode = this.extractSeasonEpisode(filename);
    if (seasonEpisode.season || seasonEpisode.episode) {
      return {
        type: 'episode',
        title: this.extractTitle(filename),
        season: seasonEpisode.season,
        episode: seasonEpisode.episode,
        file: file
      };
    }

    // 默认认为是电影
    return {
      type: 'movie',
      title: this.extractTitle(filename),
      file: file
    };
  }

  /**
   * 提取季集信息
   */
  extractSeasonEpisode(filename) {
    const patterns = [
      // S01E01, S1E1 格式
      /S(\d{1,2})E(\d{1,2})/i,
      // 第1季第1集 格式
      /第(\d{1,2})季第(\d{1,2})集/,
      // Season 1 Episode 1 格式
      /Season\s*(\d{1,2})\s*Episode\s*(\d{1,2})/i,
      // 01x01 格式（但避免匹配分辨率）
      /(?<!\d)(\d{1,2})x(\d{1,2})(?!\d)/,
      // [01][01] 格式
      /\[(\d{1,2})\]\[(\d{1,2})\]/
    ];

    for (const pattern of patterns) {
      const match = filename.match(pattern);
      if (match) {
        const season = parseInt(match[1], 10);
        const episode = parseInt(match[2], 10);
        
        // 过滤明显不合理的匹配（如分辨率）
        if (season > 50 || episode > 200) {
          continue;
        }
        
        return {
          season: season,
          episode: episode
        };
      }
    }

    // 只有集数的情况
    const episodeOnlyPatterns = [
      /E(\d{1,2})/i,
      /第(\d{1,2})集/,
      /Episode\s*(\d{1,2})/i
    ];

    for (const pattern of episodeOnlyPatterns) {
      const match = filename.match(pattern);
      if (match) {
        const episode = parseInt(match[1], 10);
        
        // 过滤不合理的集数
        if (episode > 200) {
          continue;
        }
        
        return {
          season: null,
          episode: episode
        };
      }
    }

    return { season: null, episode: null };
  }

  /**
   * 提取标题（移除年份、分辨率等信息）
   */
  extractTitle(filename) {
    let title = filename;
    
    // 移除文件扩展名
    title = title.replace(/\.[^.]+$/, '');
    
    // 移除年份
    title = title.replace(/[\(\（]\d{4}[\)\）]/g, '');
    
    // 移除分辨率信息
    title = title.replace(/\d{3,4}[pP]/g, '');
    
    // 移除编码信息
    title = title.replace(/[xX]26[45]/g, '');
    title = title.replace(/[hH]26[45]/g, '');
    
    // 移除音频信息
    title = title.replace(/AAC|AC3|DTS|TrueHD/gi, '');
    
    // 移除来源信息
    title = title.replace(/BluRay|WEB-DL|HDTV|DVDRip/gi, '');
    
    // 移除季集信息
    title = title.replace(/S\d{1,2}E\d{1,2}/gi, '');
    title = title.replace(/第\d{1,2}季第\d{1,2}集/g, '');
    
    // 移除多余的点、横线、下划线
    title = title.replace(/[\.\-_]+/g, ' ');
    
    // 清理空格
    title = title.replace(/\s+/g, ' ').trim();
    
    return title;
  }

  /**
   * 匹配季文件夹
   */
  matchSeasonFolder(folderName) {
    // 匹配 S01, S02, Season 1, 第1季 等格式
    const patterns = [
      /^S(\d{1,2})$/i,
      /^Season\s*(\d{1,2})$/i,
      /^第(\d{1,2})季$/,
      /^S(\d{1,2})\s/i
    ];

    for (const pattern of patterns) {
      const match = folderName.match(pattern);
      if (match) {
        return {
          season: parseInt(match[1], 10),
          original: folderName
        };
      }
    }

    return null;
  }

  /**
   * 检查是否为电影文件夹
   */
  isMovieFolder(folderName) {
    // 包含年份的通常是电影
    if (/\(\d{4}\)/.test(folderName)) {
      return true;
    }

    // 不包含季集信息的可能是电影
    if (!this.matchSeasonFolder(folderName) && !this.extractSeasonEpisode(folderName).season) {
      return true;
    }

    return false;
  }

  /**
   * 检查是否为电视剧文件夹
   */
  isTvFolder(folderName) {
    // 包含季信息的是电视剧
    if (this.matchSeasonFolder(folderName)) {
      return true;
    }

    // 包含季集信息的是电视剧
    if (this.extractSeasonEpisode(folderName).season) {
      return true;
    }

    return false;
  }

  /**
   * 从路径中提取系列名称
   */
  extractSeriesName(path) {
    const parts = path.split('/');
    
    // 查找包含系列信息的部分
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      if (part && !this.matchSeasonFolder(part)) {
        return this.extractTitle(part);
      }
    }
    
    return 'Unknown Series';
  }
}

module.exports = ContentDetector;