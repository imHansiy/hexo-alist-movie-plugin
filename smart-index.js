/**
 * 智能电影插件主入口 - 使用新的智能识别逻辑
 */

const SmartDetector = require('./smart-detector');
const AlistAPI = require('./alist-api');
const TMDbAPI = require('./tmdb-api');
const path = require('path');

/**
 * 聚合同名电影/电视剧
 * @param {Array} contentList - 内容列表
 * @param {Object} log - 日志对象
 * @returns {Array} 聚合后的内容列表
 */
function aggregateSameNameContent(contentList, log) {
    log.info('开始聚合同名内容...');
    
    // 按标题和媒体类型分组
    const groupedByTitle = new Map();
    
    contentList.forEach(item => {
        const groupKey = `${item.title}_${item.media_type}`;
        
        if (!groupedByTitle.has(groupKey)) {
            groupedByTitle.set(groupKey, []);
        }
        groupedByTitle.get(groupKey).push(item);
    });
    
    const aggregatedContent = [];
    let aggregatedCount = 0;
    
    for (const [groupKey, items] of groupedByTitle) {
        if (items.length === 1) {
            // 单个项目，直接添加
            aggregatedContent.push(items[0]);
        } else {
            // 多个同名项目，需要聚合
            log.info(`发现 ${items.length} 个同名内容: ${items[0].title}`);
            
            // 选择主版本（优先选择有播放文件的版本）
            const mainVersion = selectMainVersion(items, log);
            const otherVersions = items.filter(item => item.id !== mainVersion.id);
            
            // 创建聚合后的对象
            const aggregatedItem = {
                ...mainVersion,
                // 使用主版本的ID作为聚合ID
                id: mainVersion.id,
                // 添加版本信息
                versions: [
                    {
                        id: mainVersion.id,
                        version_name: getVersionName(mainVersion),
                        is_main: true,
                        media_type: mainVersion.media_type,
                        files: mainVersion.files || [],
                        seasons: mainVersion.seasons || [],
                        directory_type: mainVersion.directory_type
                    },
                    ...otherVersions.map(version => ({
                        id: version.id,
                        version_name: getVersionName(version),
                        is_main: false,
                        media_type: version.media_type,
                        files: version.files || [],
                        seasons: version.seasons || [],
                        directory_type: version.directory_type
                    }))
                ],
                // 标记为聚合内容
                is_aggregated: true,
                aggregated_count: items.length
            };
            
            aggregatedContent.push(aggregatedItem);
            aggregatedCount += items.length - 1; // 减去主版本，即聚合的数量
            
            log.info(`聚合完成: ${mainVersion.title} (主版本: ${getVersionName(mainVersion)}, 其他版本: ${otherVersions.length} 个)`);
        }
    }
    
    log.info(`聚合完成: 原 ${contentList.length} 个项目 → ${aggregatedContent.length} 个项目（聚合了 ${aggregatedCount} 个重复项目）`);
    
    return aggregatedContent;
}

/**
 * 选择主版本（优先选择有播放文件的版本）
 * @param {Array} versions - 同名版本列表
 * @param {Object} log - 日志对象
 * @returns {Object} 主版本
 */
function selectMainVersion(versions, log) {
    // 优先级：有files > 有seasons > 其他
    const withFiles = versions.filter(v => v.files && v.files.length > 0);
    const withSeasons = versions.filter(v => v.seasons && v.seasons.length > 0);
    
    if (withFiles.length > 0) {
        log.debug(`选择有files的版本作为主版本: ${withFiles[0].id}`);
        return withFiles[0];
    }
    
    if (withSeasons.length > 0) {
        log.debug(`选择有seasons的版本作为主版本: ${withSeasons[0].id}`);
        return withSeasons[0];
    }
    
    // 如果都没有播放文件，选择第一个
    log.debug(`所有版本都没有播放文件，选择第一个作为主版本: ${versions[0].id}`);
    return versions[0];
}

/**
 * 获取版本名称
 * @param {Object} version - 版本对象
 * @returns {string} 版本名称
 */
function getVersionName(version) {
    if (version.id.startsWith('movie_')) {
        return '电影版';
    } else if (version.id.startsWith('tv_')) {
        return '电视剧版';
    } else if (version.directory_type === 'movie') {
        return '电影版';
    } else if (version.directory_type === 'tv') {
        return '电视剧版';
    } else {
        return '默认版';
    }
}

/**
 * 智能生成电影数据
 */
async function generateSmartMovieData(hexo) {
    const config = hexo.config.alist_movie_generator;
    const log = hexo.log;

    if (!config) {
        log.warn('Alist Movie Generator: No configuration found');
        return;
    }

    // 验证必要配置
    if (!config.alist || !config.alist.url || !config.alist.username || !config.alist.password) {
        log.error('Alist Movie Generator: Missing Alist configuration');
        return;
    }

    if (!config.tmdb_token) {
        log.error('Alist Movie Generator: Missing TMDb token');
        return;
    }

    try {
        log.info('Smart Movie Generator: 开始智能分析...');

        // 初始化 API 客户端
        const alistAPI = new AlistAPI(config.alist, log);
        const tmdbAPI = new TMDbAPI(config.tmdb_token, log);

        // 初始化智能检测器
        const smartDetector = new SmartDetector({
            autoConfig: config.smart_detection?.auto_config !== false,
            fallbackConfig: config.smart_detection?.fallback_config || 'default',
            enableCache: config.smart_detection?.enable_cache !== false
        });

        // 准备路径配置
        const pathConfigs = [];
        
        // 处理电影目录
        if (config.movies) {
            for (const movieConfig of config.movies) {
                pathConfigs.push({
                    path: movieConfig.path,
                    type: 'movie',
                    title: movieConfig.title,
                    config: movieConfig.detection_config
                });
            }
        }

        // 处理电视剧目录
        if (config.tv_shows) {
            for (const tvConfig of config.tv_shows) {
                pathConfigs.push({
                    path: tvConfig.path,
                    type: 'tv',
                    title: tvConfig.title,
                    config: tvConfig.detection_config
                });
            }
        }

        // 处理混合目录
        if (config.mixed_content) {
            for (const mixedConfig of config.mixed_content) {
                pathConfigs.push({
                    path: mixedConfig.path,
                    type: 'mixed',
                    title: mixedConfig.title,
                    config: mixedConfig.detection_config
                });
            }
        }

        if (pathConfigs.length === 0) {
            log.error('Smart Movie Generator: No paths configured');
            return;
        }

        // 执行智能检测和分析
        log.info(`开始分析 ${pathConfigs.length} 个路径...`);
        const detectionResults = await smartDetector.detectAndAnalyze(alistAPI, pathConfigs, {
            tmdbApi: tmdbAPI  // 传递TMDb API实例
        });

        // 生成配置报告
        const configReport = smartDetector.generateConfigReport(detectionResults);
        log.info('智能检测完成，配置报告:');
        log.info(`- 推荐配置: ${configReport.recommendations.bestConfig}`);
        log.info(`- 成功路径: ${configReport.performance.successfulPaths}/${configReport.performance.totalPaths}`);
        
        if (configReport.recommendations.suggestions.length > 0) {
            log.info('建议:');
            configReport.recommendations.suggestions.forEach(suggestion => {
                log.info(`  - ${suggestion.message}`);
            });
        }

        // 获取组织后的内容并进行后处理
        let { movies: detectedMovies, tvShows: detectedTvShows } = detectionResults.organized;
        
        // 关键修复1: 合并同一电视剧的不同季
        if (detectedTvShows.length > 0) {
            log.info('开始合并电视剧季度...');
            detectedTvShows = smartDetector._mergeTvSeasons(detectedTvShows);
            log.info(`季度合并后: ${detectedTvShows.length} 部电视剧`);
        }
        
        // 关键修复2: 修正电影误识别问题
        const correctedMovies = [];
        const correctedTvShows = [];
        
        for (const movie of detectedMovies) {
            // 检查是否被误识别为电影的电视剧内容
            if (movie.seasons && movie.seasons.length > 0) {
                // 这实际上是电视剧，移到电视剧列表
                correctedTvShows.push({
                    title: movie.title,
                    path: movie.path,
                    type: 'tvshow',
                    seasons: movie.seasons.map(season => ({
                        season: season.season_number || season.season || 1,
                        episodes: season.episodes || []
                    }))
                });
                log.info(`修正误识别: ${movie.title} 从电影改为电视剧`);
            } else {
                correctedMovies.push(movie);
            }
        }
        
        for (const tvShow of detectedTvShows) {
            // 检查是否被误识别为电视剧的电影内容
            if (tvShow.seasons && tvShow.seasons.length === 1 && 
                tvShow.seasons[0].episodes && tvShow.seasons[0].episodes.length === 1 &&
                !tvShow.title.includes('S0') && !tvShow.path.includes('/S0')) {
                
                // 检查文件名是否明显是电影
                const episode = tvShow.seasons[0].episodes[0];
                const fileName = episode.file ? episode.file.name : episode.path.split('/').pop();
                
                // 如果文件名不包含季集标识，很可能是电影
                if (!fileName.match(/S\d{2}E\d{2}/i) && !fileName.match(/第.*季.*集/i)) {
                    correctedMovies.push({
                        title: tvShow.title,
                        path: episode.path,
                        type: 'movie',
                        files: [episode.file || { path: episode.path, name: fileName }]
                    });
                    log.info(`修正误识别: ${tvShow.title} 从电视剧改为电影`);
                } else {
                    correctedTvShows.push(tvShow);
                }
            } else {
                correctedTvShows.push(tvShow);
            }
        }
        
        detectedMovies = correctedMovies;
        detectedTvShows = correctedTvShows;
        
        if (detectedMovies.length === 0 && detectedTvShows.length === 0) {
            log.warn('未检测到任何有效的电影或电视剧内容');
            return;
        }

        log.info(`最终结果: ${detectedMovies.length} 部电影, ${detectedTvShows.length} 部电视剧`);

        // 获取 TMDb 信息
        let enrichedContent = [];
        const movieMap = new Map();

        // 处理电影
        for (const movie of detectedMovies) {
            try {
                const tmdbInfo = await tmdbAPI.getMediaDetails(movie.title, movie.title, 'movie');
                
                if (tmdbInfo) {
                    const uniqueId = tmdbInfo.id.toString();
                    
                    if (movieMap.has(uniqueId)) {
                        // 合并相同电影的不同版本
                        const existingMovie = movieMap.get(uniqueId);
                        existingMovie.files.push(...movie.files);
                        existingMovie.file_count = existingMovie.files.length;
                        
                        log.info(`✓ 合并电影: ${tmdbInfo.title} (新增${movie.files.length}个文件)`);
                    } else {
                        const movieData = {
                            ...tmdbInfo,
                            id: uniqueId,
                            original_tmdb_id: tmdbInfo.id,
                            files: movie.files.map(file => ({
                                ...file,
                                url: file.url || `${config.alist.url}/d${file.path}${file.sign ? `?sign=${file.sign}` : ''}`,
                                download_url: file.download_url || `${config.alist.url}/d${file.path}${file.sign ? `?sign=${file.sign}` : ''}`
                            })),
                            file_count: movie.files.length,
                            directory_type: 'movie',
                            detection_method: 'smart'
                        };
                        
                        movieMap.set(uniqueId, movieData);
                        log.info(`✓ 找到电影: ${tmdbInfo.title} (${movie.files.length} 个文件)`);
                    }
                } else {
                    // 创建未知电影条目
                    const unknownId = `unknown_movie_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    const unknownMovie = {
                        id: unknownId,
                        title: movie.title,
                        media_type: 'movie',
                        directory_type: 'movie',
                        files: movie.files.map(file => ({
                            ...file,
                            url: file.url || `${config.alist.url}/d${file.path}${file.sign ? `?sign=${file.sign}` : ''}`,
                            download_url: file.download_url || `${config.alist.url}/d${file.path}${file.sign ? `?sign=${file.sign}` : ''}`
                        })),
                        file_count: movie.files.length,
                        overview: '未能从 TMDb 获取信息的电影',
                        poster_path: null,
                        genre_names: [],
                        vote_average: 0,
                        release_date: null,
                        detection_method: 'smart'
                    };
                    
                    movieMap.set(unknownId, unknownMovie);
                    log.warn(`✗ 未找到 TMDb 信息: ${movie.title}`);
                }
            } catch (error) {
                log.error(`处理电影错误 ${movie.title}: ${error.message}`);
            }
        }

        // 处理电视剧
        for (const tvShow of detectedTvShows) {
            try {
                const tmdbInfo = await tmdbAPI.getMediaDetails(tvShow.title, tvShow.title, 'tv');
                
                if (tmdbInfo) {
                    const uniqueId = `tv_${tmdbInfo.id}`;
                    
                    // 提取季集信息
                    const seasons = tvShow.seasons.map(season => ({
                        season_number: season.season,
                        episodes: season.episodes.map(episode => ({
                            episode_number: episode.episode,
                            name: episode.title,
                            url: episode.file ? (episode.file.url || `${config.alist.url}/d${episode.file.path}${episode.file.sign ? `?sign=${episode.file.sign}` : ''}`) : `${config.alist.url}/d${episode.path}`,
                            download_url: episode.file ? (episode.file.download_url || `${config.alist.url}/d${episode.file.path}${episode.file.sign ? `?sign=${episode.file.sign}` : ''}`) : `${config.alist.url}/d${episode.path}`,
                            path: episode.path
                        }))
                    }));

                    const tvData = {
                        ...tmdbInfo,
                        id: uniqueId,
                        original_tmdb_id: tmdbInfo.id,
                        seasons: seasons,
                        files: [], // 添加空的files属性
                        episode_count: seasons.reduce((total, season) => total + season.episodes.length, 0),
                        directory_type: 'tv',
                        detection_method: 'smart'
                    };
                    
                    movieMap.set(uniqueId, tvData);
                    log.info(`✓ 找到电视剧: ${tmdbInfo.title} (${tvData.episode_count} 集)`);
                } else {
                    // 创建未知电视剧条目
                    const unknownId = `unknown_tv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    const unknownTv = {
                        id: unknownId,
                        title: tvShow.title,
                        media_type: 'tv',
                        directory_type: 'tv',
                        seasons: tvShow.seasons,
                        files: [], // 添加空的files属性
                        episode_count: tvShow.seasons.reduce((total, season) => total + season.episodes.length, 0),
                        overview: '未能从 TMDb 获取信息的电��剧',
                        poster_path: null,
                        genre_names: [],
                        vote_average: 0,
                        first_air_date: null,
                        detection_method: 'smart'
                    };
                    
                    movieMap.set(unknownId, unknownTv);
                    log.warn(`✗ 未找到 TMDb 信息: ${tvShow.title}`);
                }
            } catch (error) {
                log.error(`处理电视剧错误 ${tvShow.title}: ${error.message}`);
            }
        }

        // 转换为数组并正确分类
        const allContent = Array.from(movieMap.values());
        
        // 分离电影和电视剧
        const finalMovies = allContent.filter(item => item.media_type === 'movie' || item.directory_type === 'movie');
        const finalTvShows = allContent.filter(item => item.media_type === 'tv' || item.directory_type === 'tv');
        
        // 确保电影格式正确（不包含seasons字段）
        const finalCorrectedMovies = finalMovies.map(movie => {
            const corrected = { ...movie };
            // 移除电影不应该有的字段
            delete corrected.seasons;
            delete corrected.episode_count;
            delete corrected.number_of_seasons;
            delete corrected.number_of_episodes;
            
            // 确保正确的ID格式
            if (!corrected.id.startsWith('movie_')) {
                corrected.id = `movie_${corrected.original_tmdb_id || corrected.id}`;
            }
            
            return corrected;
        });
        
        // 确保电视剧格式正确（包含seasons字段）
        const finalCorrectedTvShows = finalTvShows.map(tvShow => {
            const corrected = { ...tvShow };
            
            // 确保正确的ID格式
            if (!corrected.id.startsWith('tv_')) {
                corrected.id = `tv_${corrected.original_tmdb_id || corrected.id.replace('movie_', '')}`;
            }
            
            // 确保有seasons字段
            if (!corrected.seasons) {
                corrected.seasons = [];
            }
            
            // 确保有episode_count字段
            if (!corrected.episode_count) {
                corrected.episode_count = corrected.seasons.reduce((total, season) => 
                    total + (season.episodes ? season.episodes.length : 0), 0);
            }
            
            return corrected;
        });

        // 合并所有内容用于输出
        enrichedContent = [...finalCorrectedMovies, ...finalCorrectedTvShows];
        
        // 聚合同名电影/电视剧（按标题聚合）
        enrichedContent = aggregateSameNameContent(enrichedContent, log);

        if (enrichedContent.length === 0) {
            log.warn('No content found with valid information');
            return;
        }

        // 排序内容
        const outputConfig = config.output || {};
        const orderBy = outputConfig.order_by || 'title';
        const order = outputConfig.order || 'asc';

        enrichedContent.sort((a, b) => {
            let aValue = a[orderBy];
            let bValue = b[orderBy];

            if (typeof aValue === 'string' && typeof bValue === 'string') {
                aValue = aValue.toLowerCase();
                bValue = bValue.toLowerCase();
            }

            if (aValue < bValue) return order === 'asc' ? -1 : 1;
            if (aValue > bValue) return order === 'asc' ? 1 : -1;
            return 0;
        });

        // 保存数据到 hexo.locals
        hexo.locals.set('movies', enrichedContent);

        // 生成 JSON 文件
        const jsonData = {
            movies: enrichedContent,
            total: enrichedContent.length,
            generated_at: new Date().toISOString(),
            detection_method: 'smart',
            config_report: configReport,
            config: {
                per_page: outputConfig.per_page || 20,
                order_by: orderBy,
                order: order
            }
        };

        // 保存 JSON 文件
        const fs = require('fs');
        const outputDir = path.join(hexo.source_dir, 'data');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const jsonPath = path.join(outputDir, 'movies.json');
        fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2), 'utf8');

        log.info(`Smart Movie Generator: 成功生成 ${enrichedContent.length} 个内容项目的数据`);
        log.info(`数据已保存到: ${jsonPath}`);

        // 统计信息
        const movieCount = enrichedContent.filter(m => m.media_type === 'movie').length;
        const tvCount = enrichedContent.filter(m => m.media_type === 'tv').length;
        const unknownCount = enrichedContent.filter(m => m.media_type === 'unknown').length;
        
        log.info(`统计: ${movieCount} 部电影, ${tvCount} 部电视剧, ${unknownCount} 个未知类型`);

    } catch (error) {
        log.error(`Smart Movie Generator error: ${error.message}`);
        log.error(error.stack);
    }
}

module.exports = {
    generateSmartMovieData
};