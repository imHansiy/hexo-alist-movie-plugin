// 智能识别系统入口
const { generateSmartMovieData } = require('./smart-index');
const AlistAPI = require('./alist-api');
const TMDbAPI = require('./tmdb-api');
const path = require('path');

/**
 * 根据内容对文件进行分组
 * @param {Array} videoFiles - 视频文件列表
 * @param {Object} log - 日志对象
 * @returns {Array} 分组后的内容列表
 */
function groupFilesByContent(videoFiles, log) {
    const groups = new Map();
    
    for (const file of videoFiles) {
        let groupKey, searchName, fallbackName;
        
        if (file.directoryType === 'movie') {
            // 电影模式：按清理后的标题分组，允许相同内容合并
            const cleanName = extractMovieTitle(file.name, file.path);
            const normalizedName = normalizeTitle(cleanName);
            groupKey = `movie_${normalizedName}`;
            searchName = cleanName;
            fallbackName = file.name;
            
        } else if (file.directoryType === 'tv') {
            // 电视剧模式：按剧集名称分组
            const seriesName = file.forcedTitle || file.seriesName || extractSeriesFromPath(file.path);
            const normalizedName = normalizeTitle(seriesName);
            groupKey = `tv_${normalizedName}`;
            searchName = seriesName;
            fallbackName = file.name;
            
        } else {
            // 混合模式：需要通过标识判断
            const cleanName = extractMovieTitle(file.name, file.path);
            const normalizedName = normalizeTitle(cleanName);
            groupKey = `mixed_${normalizedName}`;
            searchName = cleanName;
            fallbackName = file.name;
        }
        
        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                type: file.directoryType,
                searchName: searchName,
                fallbackName: fallbackName,
                files: [],
                sources: [] // 用于存储不同片源信息
            });
        }
        
        const group = groups.get(groupKey);
        group.files.push(file);
        
        // 为电影添加片源信息
        if (file.directoryType === 'movie') {
            const pathParts = file.path.split('/').filter(part => part.length > 0);
            const directoryPath = pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'default';
            
            group.sources.push({
                name: directoryPath,
                path: directoryPath,
                files: [file]
            });
        }
    }
    
    // 合并相同片源的文件
    for (const group of groups.values()) {
        if (group.type === 'movie' && group.sources.length > 0) {
            const sourceMap = new Map();
            
            for (const source of group.sources) {
                if (sourceMap.has(source.name)) {
                    sourceMap.get(source.name).files.push(...source.files);
                } else {
                    sourceMap.set(source.name, source);
                }
            }
            
            group.sources = Array.from(sourceMap.values());
        }
    }
    
    return Array.from(groups.values());
}

/**
 * 标准化标题用于分组
 * @param {string} title - 原始标题
 * @returns {string} 标准化后的标题
 */
function normalizeTitle(title) {
    return title
        .toLowerCase()
        .replace(/[^\w\s\u4e00-\u9fff]/g, '') // 移除特殊字符，保留中文
        .replace(/\s+/g, '') // 移除所有空格
        .trim();
}

/**
 * 从文件路径提取剧集名称
 * @param {string} filePath - 文件路径
 * @returns {string} 剧集名称
 */
function extractSeriesFromPath(filePath) {
    const pathParts = filePath.split('/').filter(part => part.length > 0);
    
    // 通常剧集名称在倒数第二个路径部分（倒数第一个是文件名）
    if (pathParts.length >= 2) {
        const seriesFolder = pathParts[pathParts.length - 2];
        
        // 首先检查是否包含TMDB ID格式
        const tmdbIdInfo = extractTmdbIdFromName(seriesFolder);
        if (tmdbIdInfo) {
            return tmdbIdInfo.title;
        }
        
        // 移除季信息
        return seriesFolder.replace(/\b(Season|S|第)[\s]*\d+(?:季)?/gi, '').trim();
    }
    
    return pathParts[pathParts.length - 1] || 'Unknown Series';
}

/**
 * 提取季集信息
 * @param {Array} files - 文件列表
 * @returns {Object} 季集信息
 */
function extractSeasonInfo(files) {
    const seasons = new Map();
    
    for (const file of files) {
        const season = file.season || 1;
        const episode = file.episode || 1;
        
        if (!seasons.has(season)) {
            seasons.set(season, {
                season_number: season,
                episodes: []
            });
        }
        
        seasons.get(season).episodes.push({
            episode_number: episode,
            name: file.name,
            url: file.url,
            path: file.path
        });
    }
    
    // 按季和集排序
    return Array.from(seasons.values()).map(season => ({
        ...season,
        episodes: season.episodes.sort((a, b) => a.episode_number - b.episode_number)
    })).sort((a, b) => a.season_number - b.season_number);
}

/**
 * 提取片源信息（电影多版本）
 * @param {Array} sources - 片源列表
 * @returns {Array} 片源信息
 */
function extractSourceInfo(sources) {
    const allSources = [];
    
    sources.forEach((source, sourceIndex) => {
        source.files.forEach((file, fileIndex) => {
            // 从文件名提取质量信息
            const qualityMatch = file.name.match(/\b(4K|2160p|1080p|720p|480p|HD|UHD)\b/i);
            const formatMatch = file.name.match(/\.(mp4|mkv|avi|mov|wmv|rmvb|flv)$/i);
            
            allSources.push({
                id: `${sourceIndex}_${fileIndex}`,
                source_name: source.name,
                source_path: source.path,
                file_name: file.name,
                url: file.url,
                path: file.path,
                quality: qualityMatch ? qualityMatch[1] : '',
                format: formatMatch ? formatMatch[1].toUpperCase() : '',
                // 可以添加更多信息如文件大小等
            });
        });
    });
    
    return allSources;
}

/**
 * 检测并提取TMDB ID格式
 * @param {string} name - 影片名称
 * @returns {object|null} 包含标题和TMDB ID的对象，如果不匹配则返回null
 */
function extractTmdbIdFromName(name) {
    // 先移除文件扩展名
    const nameWithoutExt = name.replace(/\.[^/.]+$/, '');
    
    // 匹配格式：影片名称(数字) 或 影片名称（数字）
    // 支持括号后可能有空格或其他字符
    const tmdbIdPattern = /^(.+?)\s*[（(](\d+)[）)]\s*.*$/;
    const match = nameWithoutExt.match(tmdbIdPattern);
    
    if (match) {
        const title = match[1].trim();
        const tmdbId = parseInt(match[2]);
        
        if (title && tmdbId > 0) {
            return { title, tmdbId };
        }
    }
    
    return null;
}

/**
 * 从文件路径和名称提取电影标题
 * @param {string} fileName - 文件名
 * @param {string} filePath - 文件路径
 * @returns {string} 清理后的电影标题
 */
function extractMovieTitle(fileName, filePath) {
    // 首先检查是否包含TMDB ID格式，如果有则直接返回提取的标题
    const tmdbIdInfo = extractTmdbIdFromName(fileName);
    if (tmdbIdInfo) {
        return tmdbIdInfo.title;
    }
    
    // 检查路径中的文件夹名是否包含TMDB ID格式
    const pathParts = filePath.split('/').filter(part => part.length > 0);
    if (pathParts.length >= 2) {
        const folderName = pathParts[pathParts.length - 2];
        const folderTmdbIdInfo = extractTmdbIdFromName(folderName);
        if (folderTmdbIdInfo) {
            return folderTmdbIdInfo.title;
        }
    }
    
    // 优先使用文件名，如果文件名无意义则使用路径中的文件夹名
    let title = fileName;
    
    // 移除文件扩展名
    title = title.replace(/\.[^/.]+$/, '');
    
    // 移除常见的视频质量标识和编码信息
    title = title.replace(/\b(4K|2160p|1080p|720p|480p|HD|UHD|BluRay|WEB-DL|BDRip|DVDRip|CAM|TS|TC)\b/gi, '');
    title = title.replace(/\b(x264|x265|H264|H265|HEVC|AVC)\b/gi, '');
    
    // 移除年份
    title = title.replace(/\b(19|20)\d{2}\b/g, '');
    
    // 移除季集信息
    title = title.replace(/\b(S\d{1,2}E\d{1,2}|Season\s*\d+|第\d+季|第\d+集|EP?\d+)\b/gi, '');
    
    // 移除括号内容（但不移除TMDB ID格式的括号）
    title = title.replace(/[\[【\(](.*?)[\]】\)]/g, '');
    
    // 替换分隔符为空格并清理
    title = title.replace(/[._\-]+/g, ' ').replace(/\s+/g, ' ').trim();
    
    // 如果清理后的标题太短或为空，尝试从路径提取
    if (!title || title.length < 2) {
        if (pathParts.length >= 2) {
            title = pathParts[pathParts.length - 2]; // 使用父文件夹名
            title = title.replace(/[._\-]+/g, ' ').replace(/\s+/g, ' ').trim();
        }
    }
    
    return title || fileName;
}

/**
 * 生成电影数据
 * @param {Object} hexo - Hexo 实例
 */
async function generateMovieData(hexo) {
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

    // 检查新的智能配置格式
    const movieDirs = config.movies || [];
    const tvDirs = config.tv_shows || [];
    const mixedDirs = config.mixed_content || [];
    
    if (movieDirs.length === 0 && tvDirs.length === 0 && mixedDirs.length === 0) {
        log.error('Alist Movie Generator: No directories configured');
        return;
    }
    
    // 如果使用了新的混合内容配置，调用智能识别系统
    if (mixedDirs.length > 0) {
        log.info('检测到混合内容配置，使用智能识别系统...');
        return await generateSmartMovieData(hexo);
    }
    
    // 合并所有目录并标记类型（兼容旧配置）
    const allDirectories = [
        ...movieDirs.map(dir => ({ ...dir, type: 'movie' })),
        ...tvDirs.map(dir => ({ ...dir, type: 'tv' }))
    ];

    try {
        log.info('Alist Movie Generator: Starting to generate movie data...');

        // 初始化 API 客户端
        const alistAPI = new AlistAPI(config.alist, log);
        const tmdbAPI = new TMDbAPI(config.tmdb_token, log);

        // 获取所有视频文件（使用新的配置格式）
        const videoFiles = await alistAPI.getAllVideoFiles(allDirectories);
        
        if (!videoFiles || videoFiles.length === 0) {
            log.warn('No video files found in specified directories');
            return;
        }

        log.info(`Found ${videoFiles.length} video files`);

        // 根据目录类型分组处理
        const movies = [];
        const movieMap = new Map(); // 用于合并相同TMDb ID的电影

        // 按目录类型和内容分组
        const groupedFiles = groupFilesByContent(videoFiles, log);
        
        for (const group of groupedFiles) {
            try {
                // 根据类型获取TMDb信息
                const tmdbInfo = await tmdbAPI.getMediaDetails(
                    group.searchName, 
                    group.fallbackName, 
                    group.type
                );
                
                if (tmdbInfo) {
                    const uniqueId = tmdbInfo.id.toString();
                    
                    if (movieMap.has(uniqueId)) {
                        // 如果已存在相同TMDb ID的电影，合并文件和片源
                        const existingMovie = movieMap.get(uniqueId);
                        
                        // 合并文件列表
                        existingMovie.files.push(...group.files);
                        existingMovie.file_count = existingMovie.files.length;
                        
                        // 合并片源信息（仅对电影）
                        if (tmdbInfo.media_type === 'movie' && group.sources) {
                            if (!existingMovie.all_sources) {
                                existingMovie.all_sources = existingMovie.sources || [];
                            }
                            existingMovie.all_sources.push(...group.sources);
                            
                            // 重新生成片源信息
                            existingMovie.sources = extractSourceInfo(existingMovie.all_sources);
                            existingMovie.source_count = existingMovie.all_sources.length;
                        }
                        
                        // 合并电视剧季集信息
                        if (tmdbInfo.media_type === 'tv') {
                            existingMovie.seasons = extractSeasonInfo(existingMovie.files);
                            existingMovie.episode_count = existingMovie.files.filter(f => f.episode).length;
                        }
                        
                        log.info(`✓ 合并${tmdbInfo.media_type === 'tv' ? '电视剧' : '电影'}: ${tmdbInfo.title} (新增${group.files.length}个文件)`);
                    } else {
                        // 创建新的电影条目
                        const movieData = {
                            ...tmdbInfo,
                            id: uniqueId,
                            original_tmdb_id: tmdbInfo.id,
                            files: group.files,
                            file_count: group.files.length,
                            directory_type: group.type,
                            // 电视剧特有信息
                            ...(tmdbInfo.media_type === 'tv' && {
                                seasons: extractSeasonInfo(group.files),
                                episode_count: group.files.filter(f => f.episode).length
                            }),
                            // 电影特有信息
                            ...(tmdbInfo.media_type === 'movie' && {
                                all_sources: group.sources || [],
                                sources: extractSourceInfo(group.sources || []),
                                source_count: group.sources ? group.sources.length : 1
                            })
                        };
                        
                        movieMap.set(uniqueId, movieData);
                        
                        const typeLabel = tmdbInfo.media_type === 'tv' ? '电视剧' : '电影';
                        const sourceInfo = tmdbInfo.media_type === 'movie' && group.sources ? 
                            ` (${group.sources.length}个片源)` : '';
                        log.info(`✓ 找到${typeLabel}: ${tmdbInfo.title}${sourceInfo} (${group.files.length} 个文件)`);
                    }
                } else {
                    // 创建未知类型条目
                    const uniqueId = `unknown_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    
                    const unknownMovie = {
                        id: uniqueId,
                        title: group.searchName,
                        media_type: 'unknown',
                        directory_type: group.type,
                        files: group.files,
                        file_count: group.files.length,
                        overview: '未能从 TMDb 获取信息的内容',
                        poster_path: null,
                        genre_names: [],
                        vote_average: 0,
                        release_date: null,
                        sources: extractSourceInfo(group.sources || []),
                        source_count: group.sources ? group.sources.length : 1
                    };
                    
                    movieMap.set(uniqueId, unknownMovie);
                    log.warn(`✗ 未找到 TMDb 信息: ${group.searchName} (标记为未知类型)`);
                }
                
            } catch (error) {
                log.error(`处理内容组错误 ${group.searchName}: ${error.message}`);
            }
        }
        
        // 将Map转换为数组
        movies.push(...movieMap.values());

        if (movies.length === 0) {
            log.warn('No movies found with valid TMDb information');
            return;
        }

        // 排序电影列表
        const outputConfig = config.output || {};
        const orderBy = outputConfig.order_by || 'title';
        const order = outputConfig.order || 'asc';

        movies.sort((a, b) => {
            let aValue = a[orderBy];
            let bValue = b[orderBy];

            // 处理不同数据类型的排序
            if (typeof aValue === 'string' && typeof bValue === 'string') {
                aValue = aValue.toLowerCase();
                bValue = bValue.toLowerCase();
            }

            if (aValue < bValue) return order === 'asc' ? -1 : 1;
            if (aValue > bValue) return order === 'asc' ? 1 : -1;
            return 0;
        });

        // 保存数据到 hexo.locals
        hexo.locals.set('movies', movies);

        // 生成 JSON 文件供前端使用
        const jsonData = {
            movies: movies,
            total: movies.length,
            generated_at: new Date().toISOString(),
            config: {
                per_page: outputConfig.per_page || 20,
                order_by: orderBy,
                order: order
            }
        };

        // 确保目录存在
        const fs = require('fs');
        const outputDir = path.join(hexo.source_dir, 'data');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // 增量合并写入 JSON（仅追加不存在的影片）
        const jsonPath = path.join(outputDir, 'movies.json');
        let outputJson = jsonData;
        let addedCount = movies.length;

        try {
            if (fs.existsSync(jsonPath)) {
                const prevRaw = fs.readFileSync(jsonPath, 'utf8');
                const prev = JSON.parse(prevRaw);
                const prevMovies = Array.isArray(prev.movies) ? prev.movies : [];
                const prevIdSet = new Set(prevMovies.map(m => String(m.id)));
                const newMoviesOnly = movies.filter(m => !prevIdSet.has(String(m.id)));

                outputJson = {
                    ...prev,
                    movies: prevMovies.concat(newMoviesOnly),
                    total: prevMovies.length + newMoviesOnly.length,
                    generated_at: new Date().toISOString(),
                    // 以当前生成配置为准
                    config: jsonData.config
                };
                addedCount = newMoviesOnly.length;
            }
        } catch (e) {
            log.warn(`Failed to read/merge existing movies.json: ${e.message}, rewriting a fresh file`);
        }

        fs.writeFileSync(jsonPath, JSON.stringify(outputJson, null, 2), 'utf8');

        log.info(`Alist Movie Generator: Successfully generated data for ${movies.length} movies (added ${addedCount} new to JSON)`);
        log.info(`Data saved to: ${jsonPath}`);

        // 统计信息
        const movieCount = movies.filter(m => m.media_type === 'movie').length;
        const tvCount = movies.filter(m => m.media_type === 'tv').length;
        const unknownCount = movies.filter(m => m.media_type === 'unknown').length;
        
        log.info(`统计: ${movieCount} 部电影, ${tvCount} 部电视剧, ${unknownCount} 个未知类型`);

    } catch (error) {
        log.error(`Alist Movie Generator error: ${error.message}`);
        log.error(error.stack);
    }
}

/**
 * 生成电影列表页面（以主题布局包裹内容片段）
 * @param {Object} hexo - Hexo 实例
 * @returns {Array<{path:string, layout:string[]|string, data:Object}>}
 */
async function generateMoviePages(hexo) {
    const config = hexo.config.alist_movie_generator;
    const outputConfig = config?.output || {};
    const route = outputConfig.route || 'movies';
    const perPage = outputConfig.per_page || 20;

    const movies = hexo.locals.get('movies') || [];
    if (movies.length === 0) {
        return [];
    }

    const pages = [];

    // 主列表页（第一页）
    {
        const totalPages = Math.ceil(movies.length / perPage);
        const currentMovies = movies.slice(0, perPage);
        const html = await hexo.render.render({
            path: path.join(__dirname, 'templates', 'movies.pug')
        }, {
            movies: currentMovies,
            current_page: 1,
            total_pages: totalPages,
            per_page: perPage,
            total_movies: movies.length,
            route,
            config: hexo.config,
            page: {
                title: '电影列表',
                path: `${route}/`
            }
        });

        pages.push({
            path: `${route}/index.html`,
            layout: ['page', 'post', 'index'],
            data: {
                title: '电影列表',
                content: html
            }
        });
    }

    // 分页（第 2 页起）
    {
        const totalPages = Math.ceil(movies.length / perPage);
        for (let p = 2; p <= totalPages; p++) {
            const startIndex = (p - 1) * perPage;
            const currentMovies = movies.slice(startIndex, startIndex + perPage);

            const html = await hexo.render.render({
                path: path.join(__dirname, 'templates', 'movies.pug')
            }, {
                movies: currentMovies,
                current_page: p,
                total_pages: totalPages,
                per_page: perPage,
                total_movies: movies.length,
                route,
                config: hexo.config,
                page: {
                    title: `电影列表 - 第${p}页`,
                    path: `${route}/page/${p}/`
                }
            });

            pages.push({
                path: `${route}/page/${p}/index.html`,
                layout: ['page', 'post', 'index'],
                data: {
                    title: `电影列表 - 第${p}页`,
                    content: html
                }
            });
        }
    }

    // 单个电影/电视剧播放页面
    for (const movie of movies) {
        const movieRoute = `${route}/${movie.media_type}/${movie.id}`;
        
        // 如果是聚合内容，使用聚合的播放器模板
        const templateName = movie.is_aggregated ? 'aggregated-player.pug' : 'player.pug';
        const templatePath = path.join(__dirname, 'templates', templateName);
        
        // 如果聚合模板不存在，使用默认模板
        const fs = require('fs');
        const finalTemplatePath = fs.existsSync(templatePath) ? templatePath : path.join(__dirname, 'templates', 'player.pug');
        
        const html = await hexo.render.render({
            path: finalTemplatePath
        }, {
            movie,
            route,
            config: hexo.config,
            page: {
                title: movie.title,
                path: `${movieRoute}/`
            }
        });

        pages.push({
            path: `${movieRoute}/index.html`,
            layout: ['page', 'post', 'index'],
            data: {
                title: movie.title,
                content: html
            }
        });
        
        // 如果是聚合内容，为每个版本生成重定向页面
        if (movie.is_aggregated && movie.versions) {
            for (const version of movie.versions) {
                if (version.id !== movie.id) { // 不为主版本生成重定向
                    const versionRoute = `${route}/${version.media_type}/${version.id}`;
                    const redirectHtml = generateRedirectPage(movieRoute, version.version_name, movie.title);
                    
                    pages.push({
                        path: `${versionRoute}/index.html`,
                        layout: ['page', 'post', 'index'],
                        data: {
                            title: `${movie.title} - ${version.version_name}`,
                            content: redirectHtml
                        }
                    });
                }
            }
        }
    }

    hexo.log.info(`Generated ${Math.ceil(movies.length / perPage)} movie list pages, and ${movies.length} player pages`);

    // Comparison Page
    const comparisonHtml = await hexo.render.render({
        path: path.join(__dirname, 'templates', 'comparison.pug')
    }, {
        movies: movies,
        route,
        config: hexo.config,
        page: {
            title: '文件识别对比',
            path: `${route}/comparison.html`
        }
    });
    pages.push({
        path: `${route}/comparison.html`,
        layout: ['page', 'post', 'index'],
        data: {
            title: '文件识别对比',
            content: comparisonHtml
        }
    });
    return pages;
}

/**
 * 复制静态资源（以路由对象返回，交由 Hexo 生成管线输出）
 * @param {Object} hexo - Hexo 实例
 * @returns {Array<{path:string, data:Function}>}
 */
function copyAssets(hexo) {
    const fs = require('fs');
    const sourcePath = path.join(__dirname, 'source');
    const routes = [];

    if (!fs.existsSync(sourcePath)) {
    return routes;
}

    // 播放器静态文件
    const playerDir = path.join(sourcePath, 'player');
    if (fs.existsSync(playerDir)) {
        const files = fs.readdirSync(playerDir);
        files.forEach(file => {
            const filePath = path.join(playerDir, file);
            const stats = fs.statSync(filePath);
            if (stats.isFile()) {
                routes.push({
                    path: `player/${file}`,
                    data: () => fs.createReadStream(filePath)
                });
            }
        });
    }

    // 通用静态资源（例如 /static/no_cover.png 等）
    const staticDir = path.join(sourcePath, 'static');
    if (fs.existsSync(staticDir)) {
        const files = fs.readdirSync(staticDir);
        files.forEach(file => {
            const filePath = path.join(staticDir, file);
            const stats = fs.statSync(filePath);
            if (stats.isFile()) {
                routes.push({
                    path: `static/${file}`,
                    data: () => fs.createReadStream(filePath)
                });
            }
        });
    }

    return routes;
}

/**
 * 注册 Hexo 生成器（返回由主题包裹的页面 + 静态资源）
 */

hexo.extend.generator.register('alist_movie', async function(locals) {
    const config = this.config.alist_movie_generator || {};
    // 生成数据
    await generateMovieData(this);

    // 生成页面（以 content 片段交由主题布局渲染）
    const pages = await generateMoviePages(this);

    // 复制静态资源（以资源路由的形式返回给 Hexo）
    const assetRoutes = copyAssets(this);

    return pages.concat(assetRoutes);
});

/**
 * 生成重定向页面HTML
 * @param {string} targetRoute - 目标路由
 * @param {string} versionName - 版本名称
 * @param {string} movieTitle - 电影标题
 * @returns {string} 重定向页面HTML
 */
function generateRedirectPage(targetRoute, versionName, movieTitle) {
    return `
<div class="redirect-page">
    <div class="redirect-content">
        <h2>正在跳转到主播放页面</h2>
        <p>您访问的是「${movieTitle}」的 <strong>${versionName}</strong>。</p>
        <p>为了更好的体验，我们将您重定向到统一的播放页面，您可以在那里选择不同的版本。</p>
        <div class="redirect-countdown">
            <span id="countdown">3</span> 秒后自动跳转...
        </div>
        <a href="/${targetRoute}/" class="redirect-button">立即跳转</a>
    </div>
</div>

<style>
.redirect-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    text-align: center;
    padding: 2rem;
}

.redirect-content {
    max-width: 500px;
    margin: 0 auto;
    padding: 2rem;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.redirect-content h2 {
    color: #333;
    margin-bottom: 1rem;
}

.redirect-content p {
    color: #666;
    line-height: 1.6;
    margin-bottom: 1rem;
}

.redirect-countdown {
    font-size: 1.2rem;
    font-weight: bold;
    color: #007bff;
    margin: 1.5rem 0;
}

#countdown {
    font-size: 2rem;
    color: #ff6b6b;
}

.redirect-button {
    display: inline-block;
    padding: 12px 24px;
    background: #007bff;
    color: white;
    text-decoration: none;
    border-radius: 6px;
    transition: background 0.3s;
}

.redirect-button:hover {
    background: #0056b3;
}
</style>

<script>
let countdown = 3;
const countdownElement = document.getElementById('countdown');

const timer = setInterval(() => {
    countdown--;
    countdownElement.textContent = countdown;
    
    if (countdown <= 0) {
        clearInterval(timer);
        window.location.href = '/${targetRoute}/';
    }
}, 1000);
</script>
    `;
}

module.exports = {
    generateMovieData,
    generateMoviePages,
    copyAssets
};