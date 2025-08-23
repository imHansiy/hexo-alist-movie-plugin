/**
 * 路径分析器 - 智能分析和处理不同的目录结构
 */

class PathAnalyzer {
  constructor(config = {}) {
    this.config = {
      // 目录深度限制
      maxDepth: config.maxDepth || 10,
      
      // 忽略的目录名
      ignoreDirs: config.ignoreDirs || [
        '.DS_Store', 'Thumbs.db', '@eaDir', '.@__thumb',
        'extras', 'behind the scenes', 'deleted scenes',
        'featurettes', 'interviews', 'scenes', 'shorts',
        'trailers', 'other', 'sample', 'samples'
      ],
      
      // 特殊目录标识
      specialDirs: {
        seasons: /^(Season|S|第)[\s\._-]*(\d{1,2})(?:季)?$/i,
        movies: /^(Movies?|电影|影片)$/i,
        tvShows: /^(TV|Television|Series|电视剧|剧集)$/i,
        documentaries: /^(Documentaries?|纪录片)$/i,
        anime: /^(Anime|动漫|动画)$/i
      },
      
      ...config
    };
  }

  /**
   * 分析路径结构
   */
  async analyzePath(alistApi, rootPath, options = {}) {
    const analysis = {
      rootPath,
      structure: 'unknown',
      depth: 0,
      categories: {
        movies: [],
        tvShows: [],
        mixed: [],
        unknown: []
      },
      pathMap: new Map(),
      statistics: {
        totalDirectories: 0,
        totalFiles: 0,
        maxDepth: 0,
        avgFilesPerDir: 0
      }
    };

    try {
      await this._analyzeRecursive(alistApi, rootPath, analysis, 0, options);
      
      // 计算统计信息
      this._calculateStatistics(analysis);
      
      // 确定整体结构类型
      analysis.structure = this._determineStructureType(analysis);
      
      return analysis;
    } catch (error) {
      console.error('路径分析失败:', error);
      throw error;
    }
  }

  /**
   * 递归分析目录
   */
  async _analyzeRecursive(alistApi, currentPath, analysis, depth, options) {
    if (depth > this.config.maxDepth) {
      console.warn(`达到最大深度限制: ${currentPath}`);
      return;
    }

    try {
      const items = await alistApi.listDirectory(currentPath);
      if (!items || items.length === 0) return;

      analysis.statistics.totalDirectories++;
      analysis.statistics.maxDepth = Math.max(analysis.statistics.maxDepth, depth);

      const pathInfo = {
        path: currentPath,
        depth,
        type: 'unknown',
        items: [],
        videoFiles: [],
        subdirectories: [],
        metadata: {}
      };

      // 分析当前目录的项目
      for (const item of items) {
        const itemPath = `${currentPath}/${item.name}`;
        
        if (item.is_dir) {
          // 跳过忽略的目录
          if (this._shouldIgnoreDirectory(item.name)) {
            continue;
          }

          pathInfo.subdirectories.push({
            name: item.name,
            path: itemPath,
            type: this._classifyDirectory(item.name)
          });

          // 递归分析子目录
          await this._analyzeRecursive(alistApi, itemPath, analysis, depth + 1, options);
        } else {
          pathInfo.items.push(item);
          
          if (this._isVideoFile(item.name)) {
            pathInfo.videoFiles.push({
              ...item,
              path: itemPath,
              metadata: this._analyzeFileName(item.name)
            });
            analysis.statistics.totalFiles++;
          }
        }
      }

      // 分析当前目录类型
      pathInfo.type = this._analyzeDirectoryType(pathInfo);
      
      // 根据类型分类
      this._categorizeDirectory(pathInfo, analysis);
      
      // 保存路径信息
      analysis.pathMap.set(currentPath, pathInfo);

    } catch (error) {
      console.error(`分析目录失败 ${currentPath}:`, error);
    }
  }

  /**
   * 判断是否应该忽略目录
   */
  _shouldIgnoreDirectory(dirName) {
    return this.config.ignoreDirs.some(ignore => 
      dirName.toLowerCase().includes(ignore.toLowerCase())
    );
  }

  /**
   * 分类目录类型
   */
  _classifyDirectory(dirName) {
    for (const [type, pattern] of Object.entries(this.config.specialDirs)) {
      if (pattern.test(dirName)) {
        return type;
      }
    }
    return 'content';
  }

  /**
   * 分析目录类型
   */
  _analyzeDirectoryType(pathInfo) {
    const { videoFiles, subdirectories } = pathInfo;
    
    // 如果有视频文件
    if (videoFiles.length > 0) {
      const movieFiles = videoFiles.filter(f => f.metadata.type === 'movie');
      const episodeFiles = videoFiles.filter(f => f.metadata.type === 'episode');
      
      if (movieFiles.length > 0 && episodeFiles.length === 0) {
        return 'movie_collection';
      } else if (episodeFiles.length > 0 && movieFiles.length === 0) {
        return 'tv_season';
      } else if (movieFiles.length > 0 && episodeFiles.length > 0) {
        return 'mixed_content';
      }
    }
    
    // 如果只有子目录
    if (subdirectories.length > 0 && videoFiles.length === 0) {
      const seasonDirs = subdirectories.filter(d => d.type === 'seasons');
      const movieDirs = subdirectories.filter(d => d.type === 'movies');
      
      if (seasonDirs.length > 0) {
        return 'tv_show';
      } else if (movieDirs.length > 0) {
        return 'movie_library';
      } else {
        return 'content_library';
      }
    }
    
    return 'unknown';
  }

  /**
   * 将目录分类到相应类别
   */
  _categorizeDirectory(pathInfo, analysis) {
    switch (pathInfo.type) {
      case 'movie_collection':
      case 'movie_library':
        analysis.categories.movies.push(pathInfo);
        break;
      case 'tv_season':
      case 'tv_show':
        analysis.categories.tvShows.push(pathInfo);
        break;
      case 'mixed_content':
        analysis.categories.mixed.push(pathInfo);
        break;
      default:
        analysis.categories.unknown.push(pathInfo);
    }
  }

  /**
   * 检查是否为视频文件
   */
  _isVideoFile(filename) {
    const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.ts', '.m2ts'];
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return videoExtensions.includes(ext);
  }

  /**
   * 分析文件名
   */
  _analyzeFileName(filename) {
    const metadata = {
      filename,
      type: 'unknown',
      title: '',
      season: null,
      episode: null,
      year: null,
      quality: null,
      format: null
    };

    // 提取质量信息
    const qualityMatch = filename.match(/\b(4K|2160p|1080p|720p|480p|HD|UHD)\b/i);
    if (qualityMatch) {
      metadata.quality = qualityMatch[1];
    }

    // 提取格式信息
    const formatMatch = filename.match(/\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|ts|m2ts)$/i);
    if (formatMatch) {
      metadata.format = formatMatch[1].toUpperCase();
    }

    // 提取年份
    const yearMatch = filename.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      metadata.year = parseInt(yearMatch[0]);
    }

    // 检查季集模式
    const seasonEpisodeMatch = filename.match(/S(\d{1,2})E(\d{1,3})/i);
    if (seasonEpisodeMatch) {
      metadata.type = 'episode';
      metadata.season = parseInt(seasonEpisodeMatch[1]);
      metadata.episode = parseInt(seasonEpisodeMatch[2]);
      metadata.title = this._extractTitle(filename);
      return metadata;
    }

    // 检查单独的集数模式
    const episodeMatch = filename.match(/(?:EP?|第)(\d{1,3})(?:集)?/i);
    if (episodeMatch) {
      metadata.type = 'episode';
      metadata.episode = parseInt(episodeMatch[1]);
      metadata.title = this._extractTitle(filename);
      return metadata;
    }

    // 默认作为电影处理
    metadata.type = 'movie';
    metadata.title = this._extractTitle(filename);
    
    return metadata;
  }

  /**
   * 提取标题
   */
  _extractTitle(filename) {
    let title = filename;
    
    // 移除文件扩展名
    title = title.replace(/\.[^.]+$/, '');
    
    // 移除质量标识
    title = title.replace(/\b(4K|2160p|1080p|720p|480p|HD|UHD|BluRay|WEB-DL|BDRip|DVDRip)\b/gi, '');
    
    // 移除编码信息
    title = title.replace(/\b(x264|x265|H264|H265|HEVC|AVC)\b/gi, '');
    
    // 移除年份
    title = title.replace(/\b(19|20)\d{2}\b/g, '');
    
    // 移除季集信息
    title = title.replace(/\b(S\d{1,2}E\d{1,3}|Season\s*\d+|第\d+季|第\d+集|EP?\d+)\b/gi, '');
    
    // 移除括号内容
    title = title.replace(/[\[【\(](.*?)[\]】\)]/g, '');
    
    // 替换分隔符为空格并清理
    title = title.replace(/[._\-]+/g, ' ').replace(/\s+/g, ' ').trim();
    
    return title || filename;
  }

  /**
   * 计算统计信息
   */
  _calculateStatistics(analysis) {
    const stats = analysis.statistics;
    
    if (stats.totalDirectories > 0) {
      stats.avgFilesPerDir = stats.totalFiles / stats.totalDirectories;
    }
    
    // 添加更多统计信息
    stats.movieDirectories = analysis.categories.movies.length;
    stats.tvDirectories = analysis.categories.tvShows.length;
    stats.mixedDirectories = analysis.categories.mixed.length;
    stats.unknownDirectories = analysis.categories.unknown.length;
  }

  /**
   * 确定整体结构类型
   */
  _determineStructureType(analysis) {
    const { movies, tvShows, mixed, unknown } = analysis.categories;
    
    if (mixed.length > 0) {
      return 'mixed';
    } else if (movies.length > 0 && tvShows.length > 0) {
      return 'categorized';
    } else if (movies.length > 0 && tvShows.length === 0) {
      return 'movies_only';
    } else if (tvShows.length > 0 && movies.length === 0) {
      return 'tv_only';
    } else if (unknown.length > 0) {
      return 'unstructured';
    } else {
      return 'empty';
    }
  }

  /**
   * 生成路径建议
   */
  generatePathSuggestions(analysis) {
    const suggestions = [];
    
    // 基于结构类型的建议
    switch (analysis.structure) {
      case 'mixed':
        suggestions.push({
          type: 'structure',
          message: '检测到混合内容结构，建议分别配置电影和电视剧目录',
          priority: 'high'
        });
        break;
        
      case 'unstructured':
        suggestions.push({
          type: 'structure',
          message: '目录结构不够清晰，建议重新组织文件结构',
          priority: 'medium'
        });
        break;
        
      case 'categorized':
        suggestions.push({
          type: 'structure',
          message: '目录结构良好，可以分别配置不同类型的内容',
          priority: 'low'
        });
        break;
    }
    
    // 基于深度的建议
    if (analysis.statistics.maxDepth > 5) {
      suggestions.push({
        type: 'depth',
        message: '目录层级过深，可能影响扫描性能',
        priority: 'medium'
      });
    }
    
    // 基于文件数量的建议
    if (analysis.statistics.avgFilesPerDir > 100) {
      suggestions.push({
        type: 'performance',
        message: '单个目录文件数量较多，建议优化目录结构',
        priority: 'medium'
      });
    }
    
    return suggestions;
  }
}

module.exports = PathAnalyzer;