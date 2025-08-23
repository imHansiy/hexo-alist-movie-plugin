/**
 * 智能检测器 - 整合所有识别逻辑的主控制器
 */

const ContentDetector = require('./content-detector');
const ConfigManager = require('./config-manager');
const PathAnalyzer = require('./path-analyzer');

class SmartDetector {
  constructor(options = {}) {
    this.configManager = new ConfigManager();
    this.pathAnalyzer = new PathAnalyzer(options.pathAnalyzer);
    this.contentDetector = null;
    
    this.options = {
      autoConfig: options.autoConfig !== false,
      fallbackConfig: options.fallbackConfig || 'default',
      enableCache: options.enableCache !== false,
      cacheTimeout: options.cacheTimeout || 3600000,
      ...options
    };
    
    this.cache = new Map();
  }

  /**
   * 智能检测和分析目录
   */
  async detectAndAnalyze(alistApi, paths, options = {}) {
    console.log(`开始智能检测和分析 ${paths.length} 个路径...`);
    
    const results = {
      paths: [],
      summary: {
        totalPaths: paths.length,
        totalMovies: 0,
        totalTvShows: 0,
        totalMixed: 0,
        totalUnknown: 0,
        recommendedConfig: 'chinese',
        suggestions: []
      },
      config: null,
      organized: {
        movies: [],
        tvShows: []
      }
    };

    try {
      // 分析每个路径
      for (const pathConfig of paths) {
        console.log(`开始分析路径: ${pathConfig.path}`);
        const pathResult = await this._analyzePathWithConfig(alistApi, pathConfig, options);
        results.paths.push(pathResult);
        
        // 累计统计
        if (pathResult.organized) {
          results.summary.totalMovies += pathResult.organized.movies.length;
          results.summary.totalTvShows += pathResult.organized.tvShows.length;
          
          // 合并到总结果
          results.organized.movies.push(...pathResult.organized.movies);
          results.organized.tvShows.push(...pathResult.organized.tvShows);
        }
      }

      // 后处理：合并同一电视剧的不同季
      if (results.organized.tvShows.length > 0) {
        console.log('开始合并电视剧季度...');
        results.organized.tvShows = this._mergeTvSeasons(results.organized.tvShows);
        console.log(`季度合并后: ${results.organized.tvShows.length} 部电视剧`);
        results.summary.totalTvShows = results.organized.tvShows.length;
      }

      // 获取TMDb信息
      if (options.tmdbApi) {
        console.log('开始获取TMDb信息...');
        await this._enrichWithTmdbData(results.organized, options.tmdbApi);
      }

      // 自动选择最佳配置
      results.summary.recommendedConfig = 'chinese';
      
      // 生成建议
      results.summary.suggestions = [{
        type: 'config',
        level: 'info',
        message: '推荐使用 "chinese" 配置以获得更好的识别效果',
        action: '切换到推荐的配置模式'
      }];

      console.log(`智能检测完成: ${results.organized.movies.length} 部电影, ${results.organized.tvShows.length} 部电视剧`);
      return results;
    } catch (error) {
      console.error('智能检测失败:', error);
      throw error;
    }
  }

  /**
   * 使用TMDb API丰富内容信息
   */
  async _enrichWithTmdbData(organized, tmdbApi) {
    console.log(`开始TMDb数据获取: ${organized.movies.length} 部电影, ${organized.tvShows.length} 部电视剧`);
    
    // 处理电影
    for (let i = 0; i < organized.movies.length; i++) {
      const movie = organized.movies[i];
      try {
        console.log(`[电影] 获取TMDb信息: ${movie.title}`);
        const tmdbData = await tmdbApi.searchMovie(movie.title);
        if (tmdbData) {
          console.log(`[电影] TMDb搜索成功: ${movie.title} -> ID: ${tmdbData.id}`);
          // 电影格式：不包含seasons字段，使用movie_前缀
          organized.movies[i] = {
            ...tmdbData,
            id: `movie_${tmdbData.id}`,
            media_type: 'movie',
            directory_type: 'movie',
            detection_method: 'smart',
            original_tmdb_id: tmdbData.id,
            original_path: movie.path,
            files: movie.files
          };
        } else {
          console.log(`[电影] TMDb搜索无结果: ${movie.title}`);
          // 保留原始数据，但确保类型正确
          organized.movies[i] = {
            ...movie,
            id: `movie_${movie.title.replace(/[^a-zA-Z0-9]/g, '_')}`,
            media_type: 'movie',
            directory_type: 'movie',
            detection_method: 'smart'
          };
        }
      } catch (error) {
        console.error(`[电影] TMDb搜索失败: ${movie.title}`, error);
        // 保留原始数据，但确保类型正确
        organized.movies[i] = {
          ...movie,
          id: `movie_${movie.title.replace(/[^a-zA-Z0-9]/g, '_')}`,
          media_type: 'movie',
          directory_type: 'movie',
          detection_method: 'smart'
        };
      }
    }

    // 处理电视剧
    for (let i = 0; i < organized.tvShows.length; i++) {
      const tvShow = organized.tvShows[i];
      try {
        console.log(`[电视剧] 获取TMDb信息: ${tvShow.title}`);
        const tmdbData = await tmdbApi.searchTv(tvShow.title);
        if (tmdbData) {
          console.log(`[电视剧] TMDb搜索成功: ${tvShow.title} -> ID: ${tmdbData.id}`);
          // 电视剧格式：包含seasons字段，使用tv_前缀
          organized.tvShows[i] = {
            ...tmdbData,
            id: `tv_${tmdbData.id}`,
            media_type: 'tv',
            directory_type: 'tv',
            detection_method: 'smart',
            original_tmdb_id: tmdbData.id,
            original_path: tvShow.path,
            seasons: tvShow.seasons.map(season => ({
              season_number: season.season,
              episodes: season.episodes || []
            })),
            episode_count: tvShow.seasons.reduce((total, season) => 
              total + (season.episodes ? season.episodes.length : 0), 0)
          };
        } else {
          console.log(`[电视剧] TMDb搜索无结果: ${tvShow.title}`);
          // 保留原始数据，但确保类型正确
          organized.tvShows[i] = {
            ...tvShow,
            id: `tv_${tvShow.title.replace(/[^a-zA-Z0-9]/g, '_')}`,
            media_type: 'tv',
            directory_type: 'tv',
            detection_method: 'smart',
            seasons: tvShow.seasons.map(season => ({
              season_number: season.season,
              episodes: season.episodes || []
            })),
            episode_count: tvShow.seasons.reduce((total, season) => 
              total + (season.episodes ? season.episodes.length : 0), 0)
          };
        }
      } catch (error) {
        console.error(`[电视剧] TMDb搜索失败: ${tvShow.title}`, error);
        // 保留原始数据，但确保类型正确
        organized.tvShows[i] = {
          ...tvShow,
          id: `tv_${tvShow.title.replace(/[^a-zA-Z0-9]/g, '_')}`,
          media_type: 'tv',
          directory_type: 'tv',
          detection_method: 'smart'
        };
      }
    }
    
    console.log(`TMDb数据获取完成: ${organized.movies.length} 部电影, ${organized.tvShows.length} 部电视剧`);
  }

  /**
   * 分析单个路径配置
   */
  async _analyzePathWithConfig(alistApi, pathConfig, options = {}) {
    try {
      // 获取目录内容
      const items = await alistApi.listDirectory(pathConfig.path);
      console.log(`找到 ${items.length} 个项目`);

      // 选择配置
      const config = this.configManager.getPreset('chinese');
      const detector = new ContentDetector(config);

      // 分析内容
      const movies = [];
      const tvShows = [];
      let totalFiles = 0;

      for (const item of items) {
        console.log(`分析项目: ${item.name} (${item.is_dir ? '文件夹' : '文件'})`);
        
        if (item.is_dir) {
          // 分析子目录
          const subResult = await this._analyzeSubdirectory(alistApi, item, pathConfig.path, detector);
          
          if (subResult.type === 'movie') {
            movies.push(subResult.content);
          } else if (subResult.type === 'tvshow') {
            tvShows.push(subResult.content);
          }
        } else {
          // 分析文件
          if (detector.isVideoFile(item.name)) {
            const fileResult = detector.analyzeFile(item);
            console.log(`文件分析结果: ${item.name} -> ${fileResult.type}`);
            
            if (fileResult.type === 'movie') {
              movies.push({
                title: fileResult.title,
                path: `${pathConfig.path}/${item.name}`,
                type: 'movie',
                mediaType: 'movie',
                files: [{
                  ...item,
                  path: `${pathConfig.path}/${item.name}`,
                  sign: item.sign // 保留签名参数
                }]
              });
            } else if (fileResult.type === 'episode') {
              // 处理单独的剧集文件
              const seasonInfo = detector.extractSeasonEpisode(item.name);
              tvShows.push({
                title: fileResult.title,
                path: `${pathConfig.path}/${item.name}`,
                type: 'tvshow',
                mediaType: 'tv',
                seasons: [{
                  season: seasonInfo.season || 1,
                  episodes: [{
                    season: seasonInfo.season || 1,
                    episode: seasonInfo.episode || 1,
                    title: fileResult.title,
                    path: `${pathConfig.path}/${item.name}`,
                    file: {
                      ...item,
                      path: `${pathConfig.path}/${item.name}`,
                      sign: item.sign // 保留签名参数
                    }
                  }]
                }]
              });
            }
            totalFiles++;
          }
        }
      }

      console.log(`路径分析完成: ${pathConfig.path} - 电影: ${movies.length}, 电视剧: ${tvShows.length}`);

      return {
        path: pathConfig.path,
        type: pathConfig.type,
        organized: { movies, tvShows },
        statistics: {
          movies: movies.length,
          tvShows: tvShows.length,
          episodes: tvShows.reduce((total, show) => 
            total + show.seasons.reduce((seasonTotal, season) => 
              seasonTotal + (season.episodes ? season.episodes.length : 0), 0), 0),
          files: totalFiles
        }
      };
    } catch (error) {
      console.error(`分析路径失败 ${pathConfig.path}:`, error.message);
      return {
        path: pathConfig.path,
        type: pathConfig.type,
        error: error.message,
        organized: { movies: [], tvShows: [] },
        statistics: { movies: 0, tvShows: 0, episodes: 0, files: 0 }
      };
    }
  }

  /**
   * 分析子目录
   */
  async _analyzeSubdirectory(alistApi, item, parentPath, detector) {
    const fullPath = `${parentPath}/${item.name}`;
    
    try {
      // 检查是否为季文件夹
      const seasonMatch = detector.matchSeasonFolder(item.name);
      if (seasonMatch) {
        // 这是一个季文件夹，获取其中的剧集
        const episodes = await this._getSeasonEpisodes(alistApi, fullPath, seasonMatch.season, detector);
        
        return {
          type: 'tvshow',
          content: {
            title: item.name,
            path: fullPath,
            type: 'tvshow',
            seasons: [{
              season: seasonMatch.season,
              episodes: episodes
            }]
          }
        };
      }

      // 获取子目录内容并判断类型
      const subItems = await alistApi.listDirectory(fullPath);
      const analysis = detector.analyzeDirectory(subItems);
      
      console.log(`子目录分析结果: ${item.name} -> ${analysis.primaryType}`);
      
      // 检查是否有明显的电视剧特征
      const hasSeasonEpisodeFiles = subItems.some(subItem => 
        !subItem.is_dir && detector.isVideoFile(subItem.name) && 
        detector.extractSeasonEpisode(subItem.name).episode
      );
      
      // 检查是否有季文件夹特征
      const hasSeasonFolders = subItems.some(subItem => 
        subItem.is_dir && detector.matchSeasonFolder(subItem.name)
      );
      
      if (hasSeasonEpisodeFiles || hasSeasonFolders || analysis.primaryType === 'tv') {
        // 有明显的电视剧特征，才当作电视剧处理
        console.log(`识别为电视剧文件夹: ${item.name}`);
        const episodes = await this._getSeasonEpisodes(alistApi, fullPath, 1, detector);
        return {
          type: 'tvshow',
          content: {
            title: item.name,
            path: fullPath,
            type: 'tvshow',
            mediaType: 'tv',
            seasons: [{
              season: 1,
              episodes: episodes
            }]
          }
        };
      } else {
        // 默认当作电影处理（包括不同画质的同一部电影）
        const movieFiles = await this._getMovieFiles(alistApi, fullPath, detector);
        
        console.log(`识别为电影文件夹: ${item.name}, 文件数量: ${movieFiles.length}`);
        
        return {
          type: 'movie',
          content: {
            title: item.name,
            path: fullPath,
            type: 'movie',
            mediaType: 'movie',
            files: movieFiles
          }
        };
      }
    } catch (error) {
      console.error(`分析子目录失败 ${fullPath}:`, error.message);
      return {
        type: 'movie',
        content: {
          title: item.name,
          path: fullPath,
          type: 'movie',
          files: []
        }
      };
    }
  }

  /**
   * 获取季的剧集
   */
  async _getSeasonEpisodes(alistApi, seasonPath, seasonNumber, detector) {
    try {
      const items = await alistApi.listDirectory(seasonPath);
      const episodes = [];

      for (const item of items) {
        if (!item.is_dir && detector.isVideoFile(item.name)) {
          const episodeInfo = detector.extractSeasonEpisode(item.name);
          const title = detector.extractTitle(item.name);
          
          // 只有当文件名包含明显的剧集信息时，才作为剧集处理
          if (episodeInfo.episode) {
            episodes.push({
              episode_number: episodeInfo.episode,
              name: title,
              url: item.url || `${alistApi.baseUrl}/d${seasonPath}/${item.name}${item.sign ? '?sign=' + item.sign : ''}`,
              download_url: item.url || `${alistApi.baseUrl}/d${seasonPath}/${item.name}${item.sign ? '?sign=' + item.sign : ''}`,
              path: `${seasonPath}/${item.name}`
            });
          } else {
            // 没有明显剧集信息的文件，使用文件名作为标题
            episodes.push({
              episode_number: episodes.length + 1, // 使用序号作为集数
              name: item.name.replace(/\.[^.]+$/, ''), // 移除扩展名作为标题
              url: item.url || `${alistApi.baseUrl}/d${seasonPath}/${item.name}${item.sign ? '?sign=' + item.sign : ''}`,
              download_url: item.url || `${alistApi.baseUrl}/d${seasonPath}/${item.name}${item.sign ? '?sign=' + item.sign : ''}`,
              path: `${seasonPath}/${item.name}`
            });
          }
        }
      }

      return episodes.sort((a, b) => (a.episode || 0) - (b.episode || 0));
    } catch (error) {
      console.error(`获取季剧集失败 ${seasonPath}:`, error.message);
      return [];
    }
  }

  /**
   * 获取电影文件
   */
  async _getMovieFiles(alistApi, moviePath, detector) {
    try {
      const items = await alistApi.listDirectory(moviePath);
      const movieFiles = [];

      for (const item of items) {
        if (!item.is_dir && detector.isVideoFile(item.name)) {
          // 为每个文件添加完整路径和URL信息
          movieFiles.push({
            ...item,
            path: `${moviePath}/${item.name}`,
            url: item.url || `${alistApi.baseUrl}/d${moviePath}/${item.name}${item.sign ? '?sign=' + item.sign : ''}`,
            download_url: item.url || `${alistApi.baseUrl}/d${moviePath}/${item.name}${item.sign ? '?sign=' + item.sign : ''}`
          });
        }
      }

      return movieFiles;
    } catch (error) {
      console.error(`获取电影文件失败 ${moviePath}:`, error.message);
      return [];
    }
  }

  /**
   * 合并同一电视剧的不同季
   */
  _mergeTvSeasons(tvShows) {
    if (!tvShows || tvShows.length === 0) return [];
    
    const seriesMap = new Map();
    
    for (const show of tvShows) {
      const seriesName = this._extractSeriesName(show);
      
      if (seriesMap.has(seriesName)) {
        // 合并到现有系列
        const existingSeries = seriesMap.get(seriesName);
        existingSeries.seasons.push(...show.seasons);
        
        // 更新路径信息
        if (show.path && !existingSeries.paths.includes(show.path)) {
          existingSeries.paths.push(show.path);
        }
      } else {
        // 创建新系列
        seriesMap.set(seriesName, {
          title: seriesName,
          type: 'tvshow',
          seasons: [...show.seasons],
          paths: [show.path].filter(Boolean)
        });
      }
    }
    
    // 转换为数组并排序季
    const mergedShows = Array.from(seriesMap.values()).map(series => {
      // 按季号排序
      series.seasons.sort((a, b) => (a.season || 1) - (b.season || 1));
      
      // 设置主路径（通常是第一个路径的父目录）
      if (series.paths.length > 0) {
        const firstPath = series.paths[0];
        const pathParts = firstPath.split('/');
        series.path = pathParts.slice(0, -1).join('/');
      }
      
      return series;
    });
    
    console.log(`季度合并: ${tvShows.length} -> ${mergedShows.length}`);
    return mergedShows;
  }

  /**
   * 从电视剧信息中提取系列名称
   */
  _extractSeriesName(show) {
    if (!show || !show.title) {
      return 'Unknown Series';
    }
    
    let seriesName = show.title;
    
    // 如果标题只是季号（如"S01", "S02"），尝试从路径提取真实名称
    if (/^S\d{2}$/.test(seriesName) || /^第\d+季$/.test(seriesName)) {
      if (show.path) {
        const pathParts = show.path.split('/');
        // 查找包含真实剧名的路径部分
        for (let i = pathParts.length - 2; i >= 0; i--) {
          const part = pathParts[i];
          if (part && !part.match(/^S\d{2}$/) && !part.match(/^第\d+季$/)) {
            seriesName = part;
            break;
          }
        }
      }
    }
    
    // 安全的字符串清理
    if (typeof seriesName === 'string') {
      seriesName = seriesName.replace(/[\(\（].*?[\)\）]/g, ''); // 移除括号内容
      seriesName = seriesName.replace(/S\d{2}-S\d{2}季全集/g, ''); // 移除季集信息
      seriesName = seriesName.replace(/\d{4}P/g, ''); // 移除分辨率
      seriesName = seriesName.replace(/[中英日韩]语.*?字/g, ''); // 移除语言字幕信息
      seriesName = seriesName.replace(/\s+/g, ' ').trim(); // 清理空格
    }
    
    return seriesName || show.title || 'Unknown Series';
  }

  /**
   * 推荐最佳配置
   */
  _recommendBestConfig(pathResults) {
    return 'chinese';
  }

  /**
   * 检查是否包含中文内容
   */
  _hasChineseContent(analysis) {
    const allItems = [
      ...analysis.movies,
      ...analysis.tvShows,
      ...analysis.mixed,
      ...analysis.subdirectories
    ];

    return allItems.some(item => 
      /[\u4e00-\u9fff]/.test(item.name) || 
      (item.files && item.files.some(file => /[\u4e00-\u9fff]/.test(file.name)))
    );
  }

  /**
   * 合并所有路径的结果
   */
  _mergeResults(pathResults) {
    const merged = {
      movies: [],
      tvShows: []
    };

    for (const result of pathResults) {
      if (result.error || !result.organized) continue;
      
      merged.movies.push(...result.organized.movies);
      merged.tvShows.push(...result.organized.tvShows);
    }

    // 去重处理（基于标题和路径）
    merged.movies = this._deduplicateContent(merged.movies);
    merged.tvShows = this._deduplicateContent(merged.tvShows);

    return merged;
  }

  /**
   * 去重内容
   */
  _deduplicateContent(items) {
    const seen = new Set();
    return items.filter(item => {
      const key = `${item.title}_${item.path}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * 计算路径统计信息
   */
  _calculatePathStatistics(organized) {
    const stats = {
      movies: organized.movies.length,
      tvShows: organized.tvShows.length,
      episodes: 0,
      files: 0
    };

    // 计算总集数和文件数
    for (const movie of organized.movies) {
      stats.files += movie.files ? movie.files.length : 1;
    }

    for (const tvShow of organized.tvShows) {
      for (const season of tvShow.seasons || []) {
        stats.episodes += season.episodes ? season.episodes.length : 0;
        stats.files += season.episodes ? season.episodes.length : 0;
      }
    }

    return stats;
  }

  /**
   * 生成建议
   */
  _generateSuggestions(results) {
    const suggestions = [];

    // 基于整体结果的建议
    const { totalMovies, totalTvShows, totalMixed } = results.summary;
    
    if (totalMixed > 0) {
      suggestions.push({
        type: 'structure',
        level: 'warning',
        message: `检测到 ${totalMixed} 个混合内容目录，建议分离电影和电视剧`,
        action: '重新组织目录结构或使用更精确的识别规则'
      });
    }

    if (totalMovies === 0 && totalTvShows === 0) {
      suggestions.push({
        type: 'content',
        level: 'error',
        message: '未检测到任何有效的电影或电视剧内容',
        action: '检查路径配置和文件命名规范'
      });
    }

    return suggestions;
  }

  /**
   * 生成配置报告
   */
  generateConfigReport(results) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: results.summary,
      paths: results.paths.map(p => ({
        path: p.path,
        type: p.type,
        statistics: p.statistics,
        config: p.config ? p.config.name : 'unknown'
      })),
      recommendations: {
        bestConfig: results.summary.recommendedConfig,
        suggestions: results.summary.suggestions
      },
      performance: {
        totalPaths: results.paths.length,
        successfulPaths: results.paths.filter(p => !p.error).length,
        failedPaths: results.paths.filter(p => p.error).length
      }
    };

    return report;
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * 获取缓存统计
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }

  /**
   * 设置配置
   */
  setConfig(configName) {
    return this.configManager.setCurrentConfig(configName);
  }

  /**
   * 获取可用配置
   */
  getAvailableConfigs() {
    return this.configManager.getPresetNames().map(name => ({
      name,
      config: this.configManager.getPreset(name)
    }));
  }

  /**
   * 添加自定义配置
   */
  addCustomConfig(name, config) {
    this.configManager.addCustomConfig(name, config);
  }
}

module.exports = SmartDetector;