/**
 * 配置管理器 - 管理不同的内容识别配置
 */

class ConfigManager {
  constructor() {
    this.presets = {
      // 默认配置
      default: {
        name: '默认配置',
        description: '适用于大多数情况的通用配置',
        moviePatterns: {
          filePatterns: [
            /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|ts|m2ts)$/i
          ],
          folderPatterns: [
            /^(.+?)[\s\.\-_]*\((\d{4})\)/, // 电影名 (年份)
            /^(.+?)[\s\.\-_]*(\d{4})/, // 电影名 年份
            /movie|电影|film/i,
          ],
          excludePatterns: [
            /S\d{2}E\d{2}/i,
            /第.*季|Season/i,
            /EP?\d+|第.*集/i,
          ]
        },
        tvPatterns: {
          seasonEpisodePatterns: [
            /S(\d{1,2})E(\d{1,3})/i,
            /Season[\s\._-]*(\d{1,2}).*EP?(\d{1,3})/i,
            /第(\d{1,2})季.*第(\d{1,3})集/i,
            /(\d{1,2})x(\d{1,3})/i,
          ],
          seasonFolderPatterns: [
            /Season[\s\._-]*(\d{1,2})/i,
            /第(\d{1,2})季/i,
            /S(\d{1,2})$/i,
          ],
          episodeFilePatterns: [
            /EP?(\d{1,3})/i,
            /第(\d{1,3})集/i,
            /E(\d{1,3})/i,
          ]
        }
      },

      // 中文优化配置
      chinese: {
        name: '中文优化配置',
        description: '针对中文命名习惯优化的配置',
        moviePatterns: {
          filePatterns: [
            /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|ts|m2ts)$/i
          ],
          folderPatterns: [
            /^(.+?)[\s\.\-_]*\((\d{4})\)/,
            /^(.+?)[\s\.\-_]*(\d{4})/,
            /电影|影片/i,
          ],
          excludePatterns: [
            /第.*季/i,
            /第.*集/i,
            /S\d{2}E\d{2}/i,
            /Season/i,
          ]
        },
        tvPatterns: {
          seasonEpisodePatterns: [
            /第(\d{1,2})季.*第(\d{1,3})集/i,
            /S(\d{1,2})E(\d{1,3})/i,
            /(\d{1,2})x(\d{1,3})/i,
          ],
          seasonFolderPatterns: [
            /第(\d{1,2})季/i,
            /Season[\s\._-]*(\d{1,2})/i,
            /S(\d{1,2})$/i,
          ],
          episodeFilePatterns: [
            /第(\d{1,3})集/i,
            /EP?(\d{1,3})/i,
            /E(\d{1,3})/i,
          ]
        }
      },

      // 严格模式配置
      strict: {
        name: '严格模式配置',
        description: '更严格的识别规则，减少误判',
        moviePatterns: {
          filePatterns: [
            /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v)$/i
          ],
          folderPatterns: [
            /^(.+?)[\s\.\-_]*\((\d{4})\)$/,
            /^(.+?)[\s\.\-_]*(\d{4})$/,
          ],
          excludePatterns: [
            /S\d{2}E\d{2}/i,
            /第.*季|Season/i,
            /EP?\d+|第.*集/i,
            /\d+x\d+/i,
          ]
        },
        tvPatterns: {
          seasonEpisodePatterns: [
            /S(\d{1,2})E(\d{1,3})/i,
            /第(\d{1,2})季.*第(\d{1,3})集/i,
          ],
          seasonFolderPatterns: [
            /^Season[\s\._-]*(\d{1,2})$/i,
            /^第(\d{1,2})季$/i,
            /^S(\d{1,2})$/i,
          ],
          episodeFilePatterns: [
            /^.*EP?(\d{1,3})/i,
            /^.*第(\d{1,3})集/i,
          ]
        }
      },

      // 宽松模式配置
      loose: {
        name: '宽松模式配置',
        description: '更宽松的识别规则，尽可能多地识别内容',
        moviePatterns: {
          filePatterns: [
            /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|ts|m2ts|rmvb|3gp|f4v)$/i
          ],
          folderPatterns: [
            /(.+)/,  // 匹配任何文件夹名
          ],
          excludePatterns: [
            /S\d{1,2}E\d{1,3}/i,
            /第.*季.*第.*集/i,
          ]
        },
        tvPatterns: {
          seasonEpisodePatterns: [
            /S(\d{1,2})E(\d{1,3})/i,
            /Season[\s\._-]*(\d{1,2}).*EP?(\d{1,3})/i,
            /第(\d{1,2})季.*第(\d{1,3})集/i,
            /(\d{1,2})x(\d{1,3})/i,
            /EP?(\d{1,3})/i,
            /第(\d{1,3})集/i,
          ],
          seasonFolderPatterns: [
            /Season[\s\._-]*(\d{1,2})/i,
            /第(\d{1,2})季/i,
            /S(\d{1,2})/i,
          ],
          episodeFilePatterns: [
            /EP?(\d{1,3})/i,
            /第(\d{1,3})集/i,
            /E(\d{1,3})/i,
            /\b(\d{1,3})\b/i,  // 任何数字都可能是集数
          ]
        }
      }
    };

    this.currentConfig = 'default';
  }

  /**
   * 获取预设配置
   */
  getPreset(name) {
    return this.presets[name] || this.presets.default;
  }

  /**
   * 获取所有预设配置名称
   */
  getPresetNames() {
    return Object.keys(this.presets);
  }

  /**
   * 设置当前配置
   */
  setCurrentConfig(name) {
    if (this.presets[name]) {
      this.currentConfig = name;
      return true;
    }
    return false;
  }

  /**
   * 获取当前配置
   */
  getCurrentConfig() {
    return this.getPreset(this.currentConfig);
  }

  /**
   * 添加自定义配置
   */
  addCustomConfig(name, config) {
    this.presets[name] = {
      name: config.name || name,
      description: config.description || '自定义配置',
      ...config
    };
  }

  /**
   * 合并配置
   */
  mergeConfig(baseConfig, overrides) {
    const merged = JSON.parse(JSON.stringify(baseConfig));
    
    if (overrides.moviePatterns) {
      Object.assign(merged.moviePatterns, overrides.moviePatterns);
    }
    
    if (overrides.tvPatterns) {
      Object.assign(merged.tvPatterns, overrides.tvPatterns);
    }
    
    return merged;
  }

  /**
   * 根据目录结构推荐配置
   */
  recommendConfig(analysis) {
    // 确保 analysis 对象有默认值
    if (!analysis) {
      return 'default';
    }

    // 确保必要的属性存在
    analysis.movies = analysis.movies || [];
    analysis.tvShows = analysis.tvShows || [];
    analysis.mixed = analysis.mixed || [];
    analysis.subdirectories = analysis.subdirectories || [];

    const hasChineseContent = this._hasChineseContent(analysis);
    const hasMixedContent = analysis.structure === 'mixed';
    const hasComplexStructure = analysis.subdirectories.length > 0;

    if (hasChineseContent) {
      return 'chinese';
    } else if (hasMixedContent || hasComplexStructure) {
      return 'loose';
    } else {
      return 'default';
    }
  }

  /**
   * 检查是否包含中文内容
   */
  _hasChineseContent(analysis) {
    if (!analysis) return false;
    
    const allItems = [
      ...(analysis.movies || []),
      ...(analysis.tvShows || []),
      ...(analysis.mixed || []),
      ...(analysis.subdirectories || [])
    ];

    return allItems.some(item => 
      /[\u4e00-\u9fff]/.test(item.name) || 
      (item.files && item.files.some(file => /[\u4e00-\u9fff]/.test(file.name)))
    );
  }

  /**
   * 生成配置报告
   */
  generateConfigReport(analysis, configName) {
    const config = this.getPreset(configName);
    
    // 确保 analysis 对象有默认值
    if (!analysis) {
      analysis = {
        movies: [],
        tvShows: [],
        mixed: [],
        subdirectories: [],
        structure: 'unknown'
      };
    }

    // 确保必要的属性存在
    analysis.movies = analysis.movies || [];
    analysis.tvShows = analysis.tvShows || [];
    analysis.mixed = analysis.mixed || [];
    analysis.subdirectories = analysis.subdirectories || [];

    const report = {
      configName,
      configDescription: config.description,
      analysis: {
        totalItems: analysis.movies.length + analysis.tvShows.length + analysis.mixed.length,
        movies: analysis.movies.length,
        tvShows: analysis.tvShows.length,
        mixed: analysis.mixed.length,
        structure: analysis.structure
      },
      recommendations: []
    };

    // 生成建议
    if (analysis.mixed.length > 0) {
      report.recommendations.push('检测到混合内容，建议使用更精确的识别规则');
    }

    if (this._hasChineseContent(analysis)) {
      report.recommendations.push('检测到中文内容，建议使用中文优化配置');
    }

    if (analysis.structure === 'nested') {
      report.recommendations.push('检测到嵌套结构，建议使用宽松模式配置');
    }

    return report;
  }
}

module.exports = ConfigManager;