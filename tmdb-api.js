const axios = require('axios');

class TMDbAPI {
    constructor(token, log, language = 'zh-CN') {
        this.token = token;
        this.log = log;
        this.language = language;
        this.api = axios.create({
            baseURL: 'https://api.themoviedb.org/3',
        });
        
        // 缓存影片类型和流派信息
        this.genreCache = {
            movie: null,
            tv: null
        };
        this.initialized = false;
    }

    /**
     * 初始化并缓存影片类型信息
     * @param {number} retries - 重试次数
     * @returns {Promise<void>}
     */
    async initialize(retries = 2) {
        if (this.initialized) return;
        
        try {
            this.log.info('正在初始化 TMDb API 并缓存影片类型信息...');
            
            // 设置较短的超时时间
            const timeout = 10000; // 10秒超时
            
            // 获取电影类型
            const movieGenresResponse = await this.api.get('/genre/movie/list', {
                params: {
                    api_key: this.token,
                    language: this.language,
                },
                timeout: timeout
            });
            
            // 获取电视剧类型
            const tvGenresResponse = await this.api.get('/genre/tv/list', {
                params: {
                    api_key: this.token,
                    language: this.language,
                },
                timeout: timeout
            });
            
            this.genreCache.movie = movieGenresResponse.data.genres || [];
            this.genreCache.tv = tvGenresResponse.data.genres || [];
            
            this.log.info(`已缓存 ${this.genreCache.movie.length} 个电影类型和 ${this.genreCache.tv.length} 个电视剧类型`);
            this.initialized = true;
            
        } catch (error) {
            this.log.warn(`初始化 TMDb API 失败: ${error.message}`);
            
            if (retries > 0) {
                this.log.info(`正在重试初始化... (剩余重试次数: ${retries})`);
                await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒后重试
                return this.initialize(retries - 1);
            } else {
                this.log.warn('TMDb API 初始化失败，将使用降级模式（无流派信息）');
                // 设置空的流派缓存，允许插件继续运行
                this.genreCache.movie = [];
                this.genreCache.tv = [];
                this.initialized = true; // 标记为已初始化，避免重复尝试
            }
        }
    }

    /**
     * 根据类型和ID获取流派名称
     * @param {string} mediaType - 媒体类型 ('movie' 或 'tv')
     * @param {number[]} genreIds - 流派ID数组
     * @returns {string[]} 流派名称数组
     */
    getGenreNames(mediaType, genreIds) {
        if (!this.genreCache[mediaType] || !genreIds) return [];
        
        return genreIds.map(id => {
            const genre = this.genreCache[mediaType].find(g => g.id === id);
            return genre ? genre.name : `未知类型(${id})`;
        });
    }

    /**
     * 获取电视剧详细信息
     * @param {number} seriesId - 电视剧ID
     * @param {object} options - 选项参数
     * @returns {Promise<object|null>} 电视剧详细信息
     */
    async getTVDetails(seriesId, options = {}) {
        try {
            const {
                append_to_response = 'content_ratings,credits,external_ids,keywords,recommendations,similar,videos',
                language = this.language
            } = options;

            const response = await this.api.get(`/tv/${seriesId}`, {
                params: {
                    api_key: this.token,
                    language: language,
                    append_to_response: append_to_response
                },
                timeout: 15000 // 15秒超时
            });

            const details = response.data;
            
            // 处理内容分级信息
            let processedContentRatings = null;
            if (details.content_ratings && details.content_ratings.results) {
                processedContentRatings = this._processContentRatings(details.content_ratings.results);
            }

            // 处理季信息
            const processedSeasons = details.seasons ? details.seasons.map(season => ({
                ...season,
                air_date: season.air_date,
                episode_count: season.episode_count,
                id: season.id,
                name: this._cleanText(season.name),
                overview: this._cleanText(season.overview),
                poster_path: season.poster_path,
                season_number: season.season_number,
                vote_average: season.vote_average
            })) : [];

            // 处理创作者信息
            const processedCreatedBy = details.created_by ? details.created_by.map(creator => ({
                id: creator.id,
                credit_id: creator.credit_id,
                name: this._cleanText(creator.name),
                gender: creator.gender,
                profile_path: creator.profile_path
            })) : [];

            // 处理网络信息
            const processedNetworks = details.networks ? details.networks.map(network => ({
                id: network.id,
                logo_path: network.logo_path,
                name: this._cleanText(network.name),
                origin_country: network.origin_country
            })) : [];

            // 处理制作公司信息
            const processedProductionCompanies = details.production_companies ? 
                details.production_companies.map(company => ({
                    id: company.id,
                    logo_path: company.logo_path,
                    name: this._cleanText(company.name),
                    origin_country: company.origin_country
                })) : [];

            return {
                adult: details.adult,
                backdrop_path: details.backdrop_path,
                created_by: processedCreatedBy,
                episode_run_time: details.episode_run_time || [],
                first_air_date: details.first_air_date,
                genres: details.genres || [],
                homepage: details.homepage,
                id: details.id,
                in_production: details.in_production,
                languages: details.languages || [],
                last_air_date: details.last_air_date,
                last_episode_to_air: details.last_episode_to_air,
                name: this._cleanText(details.name),
                next_episode_to_air: details.next_episode_to_air,
                networks: processedNetworks,
                number_of_episodes: details.number_of_episodes,
                number_of_seasons: details.number_of_seasons,
                origin_country: details.origin_country || [],
                original_language: details.original_language,
                original_name: this._cleanText(details.original_name),
                overview: this._cleanText(details.overview),
                popularity: details.popularity,
                poster_path: details.poster_path,
                production_companies: processedProductionCompanies,
                production_countries: details.production_countries || [],
                seasons: processedSeasons,
                spoken_languages: details.spoken_languages || [],
                status: details.status,
                tagline: this._cleanText(details.tagline),
                type: details.type,
                vote_average: details.vote_average,
                vote_count: details.vote_count,
                // 附加信息
                content_ratings: processedContentRatings,
                credits: details.credits,
                external_ids: details.external_ids,
                keywords: details.keywords,
                recommendations: details.recommendations,
                similar: details.similar,
                videos: details.videos
            };

        } catch (error) {
            this.log.error(`获取电视剧详细信息失败 (ID: ${seriesId}): ${error.message}`);
            if (error.response) {
                this.log.error(`TMDb API 响应: ${error.response.status} ${JSON.stringify(error.response.data)}`);
            }
            return null;
        }
    }

    /**
     * 获取电视剧季详细信息
     * @param {number} seriesId - 电视剧ID
     * @param {number} seasonNumber - 季数
     * @param {object} options - 选项参数
     * @returns {Promise<object|null>} 季详细信息
     */
    async getTVSeasonDetails(seriesId, seasonNumber, options = {}) {
        try {
            const {
                append_to_response = 'credits,external_ids,images,videos',
                language = this.language
            } = options;

            const response = await this.api.get(`/tv/${seriesId}/season/${seasonNumber}`, {
                params: {
                    api_key: this.token,
                    language: language,
                    append_to_response: append_to_response
                },
                timeout: 15000
            });

            const seasonDetails = response.data;

            // 处理剧集信息
            const processedEpisodes = seasonDetails.episodes ? seasonDetails.episodes.map(episode => ({
                air_date: episode.air_date,
                episode_number: episode.episode_number,
                id: episode.id,
                name: this._cleanText(episode.name),
                overview: this._cleanText(episode.overview),
                production_code: episode.production_code,
                runtime: episode.runtime,
                season_number: episode.season_number,
                show_id: episode.show_id,
                still_path: episode.still_path,
                vote_average: episode.vote_average,
                vote_count: episode.vote_count,
                crew: episode.crew || [],
                guest_stars: episode.guest_stars || []
            })) : [];

            return {
                _id: seasonDetails._id,
                air_date: seasonDetails.air_date,
                episodes: processedEpisodes,
                name: this._cleanText(seasonDetails.name),
                overview: this._cleanText(seasonDetails.overview),
                id: seasonDetails.id,
                poster_path: seasonDetails.poster_path,
                season_number: seasonDetails.season_number,
                vote_average: seasonDetails.vote_average,
                // 附加信息
                credits: seasonDetails.credits,
                external_ids: seasonDetails.external_ids,
                images: seasonDetails.images,
                videos: seasonDetails.videos
            };

        } catch (error) {
            this.log.error(`获取电视剧季详细信息失败 (Series ID: ${seriesId}, Season: ${seasonNumber}): ${error.message}`);
            if (error.response) {
                this.log.error(`TMDb API 响应: ${error.response.status} ${JSON.stringify(error.response.data)}`);
            }
            return null;
        }
    }

    /**
     * 获取电视剧剧集详细信息
     * @param {number} seriesId - 电视剧ID
     * @param {number} seasonNumber - 季数
     * @param {number} episodeNumber - 集数
     * @param {object} options - 选项参数
     * @returns {Promise<object|null>} 剧集详细信息
     */
    async getTVEpisodeDetails(seriesId, seasonNumber, episodeNumber, options = {}) {
        try {
            const {
                append_to_response = 'credits,external_ids,images,translations,videos',
                language = this.language
            } = options;

            const response = await this.api.get(`/tv/${seriesId}/season/${seasonNumber}/episode/${episodeNumber}`, {
                params: {
                    api_key: this.token,
                    language: language,
                    append_to_response: append_to_response
                },
                timeout: 15000
            });

            const episodeDetails = response.data;

            return {
                air_date: episodeDetails.air_date,
                crew: episodeDetails.crew || [],
                episode_number: episodeDetails.episode_number,
                guest_stars: episodeDetails.guest_stars || [],
                name: this._cleanText(episodeDetails.name),
                overview: this._cleanText(episodeDetails.overview),
                id: episodeDetails.id,
                production_code: episodeDetails.production_code,
                runtime: episodeDetails.runtime,
                season_number: episodeDetails.season_number,
                still_path: episodeDetails.still_path,
                vote_average: episodeDetails.vote_average,
                vote_count: episodeDetails.vote_count,
                // 附加信息
                credits: episodeDetails.credits,
                external_ids: episodeDetails.external_ids,
                images: episodeDetails.images,
                translations: episodeDetails.translations,
                videos: episodeDetails.videos
            };

        } catch (error) {
            this.log.error(`获取剧集详细信息失败 (Series ID: ${seriesId}, S${seasonNumber}E${episodeNumber}): ${error.message}`);
            if (error.response) {
                this.log.error(`TMDb API 响应: ${error.response.status} ${JSON.stringify(error.response.data)}`);
            }
            return null;
        }
    }

    /**
     * 获取电视剧内容分级
     * @param {number} seriesId - 电视剧ID
     * @returns {Promise<object|null>} 内容分级信息
     */
    async getTVContentRatings(seriesId) {
        try {
            const response = await this.api.get(`/tv/${seriesId}/content_ratings`, {
                params: {
                    api_key: this.token,
                },
                timeout: 10000 // 10秒超时
            });

            if (!response.data.results) {
                return null;
            }

            const processedRatings = this._processContentRatings(response.data.results);

            return {
                id: response.data.id,
                results: processedRatings
            };

        } catch (error) {
            this.log.warn(`获取电视剧内容分级失败 (ID: ${seriesId}): ${error.message}`);
            // 网络错误时返回 null，不影响主要功能
            return null;
        }
    }

    /**
     * 处理内容分级信息
     * @param {Array} ratings - 原始分级数据
     * @returns {Array} 处理后的分级信息
     * @private
     */
    _processContentRatings(ratings) {
        if (!ratings || !Array.isArray(ratings)) {
            return [];
        }

        // 处理分级信息，优先显示中国和美国的分级
        const priorityCountries = ['CN', 'US', 'GB', 'CA', 'AU'];
        
        // 按优先级排序分级
        const sortedRatings = ratings.sort((a, b) => {
            const aIndex = priorityCountries.indexOf(a.iso_3166_1);
            const bIndex = priorityCountries.indexOf(b.iso_3166_1);
            
            if (aIndex !== -1 && bIndex !== -1) {
                return aIndex - bIndex;
            } else if (aIndex !== -1) {
                return -1;
            } else if (bIndex !== -1) {
                return 1;
            } else {
                return a.iso_3166_1.localeCompare(b.iso_3166_1);
            }
        });

        // 添加分级说明
        return sortedRatings.map(rating => ({
            ...rating,
            meaning: this.getRatingMeaning(rating.rating, rating.iso_3166_1)
        }));
    }

    /**
     * 获取分级说明
     * @param {string} rating - 分级标识
     * @param {string} country - 国家代码
     * @returns {string} 分级说明
     */
    getRatingMeaning(rating, country) {
        const ratingMeanings = {
            'US': {
                'TV-Y': '适合所有儿童',
                'TV-Y7': '适合7岁以上儿童',
                'TV-G': '普通观众',
                'TV-PG': '建议家长指导',
                'TV-14': '不适合14岁以下观众',
                'TV-MA': '仅限成人观看',
                'NR': '未分级',
                'R': '限制级'
            },
            'CN': {
                'G': '普通级',
                'PG': '辅导级',
                'PG-13': '13岁以上',
                'R': '限制级',
                'NC-17': '17岁以上'
            },
            'GB': {
                'U': '普遍适宜',
                'PG': '家长指导',
                '12': '12岁以上',
                '15': '15岁以上',
                '18': '18岁以上'
            }
        };

        return ratingMeanings[country]?.[rating] || `${country} ${rating}级`;
    }

    /**
     * 过滤无意义的关键词
     * @param {string} keyword - 待检查的关键词
     * @returns {boolean} 是否为有意义的关键词
     * @private
     */
    _filterMeaninglessKeywords(keyword) {
        const meaninglessKeywords = [
            '电影', '动漫', '视频', '下载', '完成', '合集', '全集', '影片', '电视剧',
            'movie', 'movies', 'tv', 'series', 'season', 'episode', 'video', 'film',
            'S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10',
            'E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07', 'E08', 'E09', 'E10'
        ];
        
        const trimmed = keyword.trim().toLowerCase();
        
        // 检查是否为无意义关键词
        if (meaninglessKeywords.some(word => 
            trimmed === word.toLowerCase() || 
            trimmed.includes(word.toLowerCase()) && trimmed.length <= word.length + 2
        )) {
            return false;
        }
        
        // 检查是否为纯季集标记
        if (/^(S\d{1,2}|E\d{1,2}|第\d+[季集])$/i.test(trimmed)) {
            return false;
        }
        
        // 检查最小长度
        if (trimmed.length < 2) {
            return false;
        }
        
        return true;
    }

    /**
     * 智能清理文件名，提取可能的标题
     * @param {string} fileName - 原始文件名
     * @returns {string[]} 清理后的可能标题数组
     */
    _smartCleanFileName(fileName) {
        const candidates = [];
        let cleaned = fileName;
        
        // 移除文件扩展名
        cleaned = cleaned.replace(/\.[^/.]+$/, '');
        
        // 第一步：提取原始标题（移除技术标识前）
        const originalTitle = this._extractOriginalTitle(cleaned);
        if (originalTitle && originalTitle.length > 1) {
            candidates.push(originalTitle);
        }
        
        // 第二步：渐进式清理，生成多个候选标题
        candidates.push(...this._generateTitleCandidates(cleaned));
        
        // 第三步：从路径中提取可能的标题
        if (fileName.includes('/')) {
            const pathParts = fileName.split('/').filter(part => part.length > 0);
            for (const part of pathParts) {
                const pathTitle = this._extractOriginalTitle(part);
                if (pathTitle && pathTitle.length > 1) {
                    candidates.push(pathTitle);
                }
            }
        }
        
        // 去重并过滤
        const uniqueCandidates = [...new Set(candidates)];
        return uniqueCandidates.filter(title => 
            title && title.length >= 2 && this._filterMeaninglessKeywords(title)
        );
    }

    /**
     * 提取原始标题（保留更多信息）
     * @param {string} text - 输入文本
     * @returns {string} 提取的标题
     * @private
     */
    _extractOriginalTitle(text) {
        let title = text;
        
        // 只移除明显的技术标识，保留可能的标题信息
        
        // 移除字幕组信息（方括号内容）
        title = title.replace(/\[([^\]]*)\]/g, '');
        
        // 移除圆括号中的技术信息（但保留可能的副标题）
        title = title.replace(/\(([^)]*(?:1080p|720p|480p|4K|BluRay|WEB-DL|x264|x265|HEVC)[^)]*)\)/gi, '');
        
        // 移除明显的技术标识
        title = title.replace(/\b(4K|2160p|1080p|720p|480p|HD|UHD|BluRay|WEB-DL|BDRip|DVDRip|WEBRip|HDTV)\b/gi, '');
        title = title.replace(/\b(x264|x265|H264|H265|HEVC|AVC|10bit|8bit)\b/gi, '');
        title = title.replace(/\b(AAC|FLAC|DTS|AC3|MP3)\b/gi, '');
        
        // 移除字幕组标识
        title = title.replace(/\b(TearsHD|OurTV|VINEnc|RARBG|YTS|ETRG|Nekomoe|kissaten|Haruhana|CoolComic404|Sakurato|Comicat)\b/gi, '');
        
        // 移除语言和字幕标识
        title = title.replace(/\b(Chinese|Japanese|English|SUB|DUB|繁日|简体|内嵌|CLEAN|SOURCE|TELESYNC)\b/gi, '');
        
        // 移除版本标识
        title = title.replace(/\bV\d+\b/gi, '');
        title = title.replace(/\bNEW\b/gi, '');
        
        // 清理分隔符和空格
        title = title.replace(/[._\-]+/g, ' ');
        title = title.replace(/\s+/g, ' ').trim();
        
        return title;
    }

    /**
     * 生成多个标题候选
     * @param {string} text - 输入文本
     * @returns {string[]} 候选标题数组
     * @private
     */
    _generateTitleCandidates(text) {
        const candidates = [];
        let working = text;
        
        // 候选1：移除年份
        let candidate1 = working.replace(/\b(19|20)\d{2}\b/g, '');
        candidate1 = this._extractOriginalTitle(candidate1);
        if (candidate1) candidates.push(candidate1);
        
        // 候选2：移除季集信息
        let candidate2 = working.replace(/\b(S\d{1,2}E\d{1,2}|Season\s*\d+|第\d+季|第\d+集|EP?\d+)\b/gi, '');
        candidate2 = this._extractOriginalTitle(candidate2);
        if (candidate2) candidates.push(candidate2);
        
        // 候选3：提取主要单词（适用于英文标题）
        const words = working.split(/[\s\._\-]+/).filter(word => 
            word.length > 2 && 
            !/^\d+$/.test(word) && 
            !/(1080p|720p|480p|4K|BluRay|WEB|DL|x264|x265|HEVC|AAC|FLAC)/i.test(word)
        );
        
        if (words.length >= 2) {
            // 取前几个主要单词
            const mainTitle = words.slice(0, Math.min(4, words.length)).join(' ');
            candidates.push(mainTitle);
        }
        
        // 候选4：提取中文部分（如果存在）
        const chineseMatch = working.match(/[\u4e00-\u9fff]+/g);
        if (chineseMatch && chineseMatch.length > 0) {
            const chineseTitle = chineseMatch.join('');
            if (chineseTitle.length >= 2) {
                candidates.push(chineseTitle);
            }
        }
        
        // 候选5：提取英文主体部分
        const englishMatch = working.match(/[a-zA-Z]+(?:\s+[a-zA-Z]+)*/g);
        if (englishMatch && englishMatch.length > 0) {
            for (const match of englishMatch) {
                if (match.length >= 4 && !/^(Chinese|Japanese|English|SUB|DUB|BluRay|WEB|DL)$/i.test(match)) {
                    candidates.push(match.trim());
                }
            }
        }
        
        return candidates;
    }

    /**
     * 智能多语言搜索 - 完全通用算法，无硬编码
     * @param {string[]} titleCandidates - 标题候选数组
     * @param {string} mediaType - 媒体类型
     * @returns {Promise<object|null>} 搜索结果
     * @private
     */
    async _smartMultiLanguageSearch(titleCandidates, mediaType = 'mixed') {
        for (const candidate of titleCandidates) {
            try {
                this.log.debug(`尝试搜索关键词: "${candidate}"`);
                
                // 1. 直接搜索原始关键词
                let searchResult = await this.searchMulti(candidate);
                
                if (searchResult && searchResult.results && searchResult.results.length > 0) {
                    const result = this._selectBestResult(searchResult.results, mediaType);
                    if (result) {
                        this.log.info(`匹配到 ${result.media_type}: "${result.title || result.name}" (ID: ${result.id})`);
                        return result;
                    }
                }
                
                // 2. 尝试搜索变体（仅基于语言特征，不针对特定内容）
                const variations = this._generateSearchVariations(candidate);
                
                for (const variation of variations) {
                    searchResult = await this.searchMulti(variation);
                    if (searchResult && searchResult.results && searchResult.results.length > 0) {
                        const result = this._selectBestResult(searchResult.results, mediaType);
                        if (result) {
                            this.log.info(`匹配到 ${result.media_type}: "${result.title || result.name}" (ID: ${result.id}) [变体搜索: ${variation}]`);
                            return result;
                        }
                    }
                }
                
      } catch (error) {
        console.warn(`TMDb搜索失败: ${query}`, error);
        return null;
      }
        }
        
        return null;
    }

    /**
     * 生成搜索变体 - 基于语言特征的通用方法
     * @param {string} candidate - 原始候选词
     * @returns {string[]} 搜索变体数组
     * @private
     */
    _generateSearchVariations(candidate) {
        const variations = [];
        
        // 检测语言类型
        const hasEnglish = /[a-zA-Z]/.test(candidate);
        const hasChinese = /[\u4e00-\u9fff]/.test(candidate);
        const hasJapanese = /[\u3040-\u309f\u30a0-\u30ff]/.test(candidate);
        
        // 基于语言特征生成变体
        if (hasEnglish && !hasChinese && !hasJapanese) {
            // 纯英文：添加常见后缀
            variations.push(candidate + ' movie');
            variations.push(candidate + ' film');
            variations.push(candidate + ' anime');
        }
        
        if (hasChinese) {
            // 包含中文：尝试不同的表达方式
            variations.push(candidate + ' 电影');
            variations.push(candidate + ' 动画');
        }
        
        // 尝试移除常见的修饰词
        const withoutModifiers = candidate
            .replace(/\b(电影|动画|动漫|剧场版|movie|film|anime)\b/gi, '')
            .trim();
        
        if (withoutModifiers && withoutModifiers !== candidate) {
            variations.push(withoutModifiers);
        }
        
        // 尝试替换常见的分隔符
        if (candidate.includes(' ')) {
            variations.push(candidate.replace(/\s+/g, ''));
        }
        
        return variations.filter(v => v && v.length >= 2);
    }

    /**
     * 选择最佳搜索结果
     * @param {Array} results - 搜索结果数组
     * @param {string} mediaType - 期望的媒体类型
     * @returns {object|null} 最佳结果
     * @private
     */
    _selectBestResult(results, mediaType) {
        if (!results || results.length === 0) return null;
        
        // 根据媒体类型筛选
        let filteredResults = results;
        if (mediaType === 'movie') {
            filteredResults = results.filter(item => item.media_type === 'movie');
        } else if (mediaType === 'tv') {
            filteredResults = results.filter(item => item.media_type === 'tv');
        }
        
        // 如果没有匹配的类型，使用所有结果
        if (filteredResults.length === 0) {
            filteredResults = results;
        }
        
        // 按受欢迎程度和评分排序
        filteredResults.sort((a, b) => {
            const scoreA = (a.popularity || 0) * 0.7 + (a.vote_average || 0) * 0.3;
            const scoreB = (b.popularity || 0) * 0.7 + (b.vote_average || 0) * 0.3;
            return scoreB - scoreA;
        });
        
        return filteredResults[0];
    }

    /**
     * 多媒体搜索 - 搜索电影、电视剧和人物
     * @param {string} query - 搜索关键词
     * @param {object} options - 搜索选项
     * @returns {Promise<object|null>} 搜索结果
     */
    async searchMulti(query, options = {}) {
        // 尝试初始化，但不强制要求成功
        if (!this.initialized) {
            await this.initialize().catch(() => {
                this.log.warn('搜索时初始化失败，将继续执行但无流派信息');
            });
        }
        
        const {
            include_adult = false,
            page = 1
        } = options;

        try {
            const response = await this.api.get('/search/multi', {
                params: {
                    api_key: this.token,
                    query: query,
                    include_adult: include_adult,
                    language: this.language,
                    page: page,
                },
                timeout: 15000 // 15秒超时
            });

            if (!response.data.results) {
                return null;
            }

            // 处理搜索结果，添加流派信息
            const processedResults = response.data.results.map(item => {
                const processedItem = { ...item };
                
                // 根据媒体类型添加流派名称（如果初始化成功的话）
                if (item.media_type === 'movie' || item.media_type === 'tv') {
                    processedItem.genre_names = this.getGenreNames(item.media_type, item.genre_ids);
                }
                
                // 统一日期字段
                if (item.media_type === 'tv') {
                    processedItem.release_date = item.first_air_date;
                }
                
                return processedItem;
            });

            return {
                page: response.data.page,
                results: processedResults,
                total_pages: response.data.total_pages,
                total_results: response.data.total_results
            };

        } catch (error) {
            this.log.error(`多媒体搜索失败 "${query}": ${error.message}`);
            if (error.response) {
                this.log.error(`TMDb API 响应: ${error.response.status} ${JSON.stringify(error.response.data)}`);
            }
            return null;
        }
    }

    /**
     * 检测并提取TMDB ID格式
     * @param {string} name - 影片名称
     * @returns {object|null} 包含标题和TMDB ID的对象，如果不匹配则返回null
     * @private
     */
    _extractTmdbId(name) {
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
     * 直接通过TMDB ID获取媒体详情
     * @param {number} tmdbId - TMDB ID
     * @param {string} mediaType - 媒体类型 ('movie', 'tv', 'mixed')
     * @returns {Promise<object|null>} 媒体详情或null
     * @private
     */
    async _getDetailsByTmdbId(tmdbId, mediaType = 'mixed') {
        // 尝试初始化，但不强制要求成功
        if (!this.initialized) {
            await this.initialize().catch(() => {
                this.log.warn('获取媒体详情时初始化失败，将继续执行但无流派信息');
            });
        }

        const tryMediaTypes = mediaType === 'mixed' ? ['movie', 'tv'] : [mediaType];
        
        for (const type of tryMediaTypes) {
            try {
                this.log.info(`尝试通过TMDB ID ${tmdbId} 获取${type === 'movie' ? '电影' : '电视剧'}信息...`);
                
                // 如果是电视剧，使用getTVDetails获取完整信息
                if (type === 'tv') {
                    const tvDetails = await this.getTVDetails(tmdbId);
                    if (tvDetails) {
                        const result = {
                            ...tvDetails,
                            title: tvDetails.name, // 统一使用title字段
                            media_type: 'tv',
                            genre_names: this.getGenreNames('tv', tvDetails.genres?.map(g => g.id) || []),
                            release_date: tvDetails.first_air_date,
                            from_tmdb_id: true
                        };
                        
                        this.log.info(`✓ 通过TMDB ID ${tmdbId} 成功获取电视剧: ${result.title}`);
                        return result;
                    }
                } else {
                    // 电影使用基础API
                    const detailsResponse = await this.api.get(`/movie/${tmdbId}`, {
                        params: {
                            api_key: this.token,
                            language: this.language,
                        },
                        timeout: 15000
                    });

                    const details = detailsResponse.data;
                    
                    // 统一返回格式，确保字符串正确编码
                    const result = {
                        id: details.id,
                        title: this._cleanText(details.title),
                        overview: this._cleanText(details.overview),
                        poster_path: details.poster_path,
                        release_date: details.release_date,
                        media_type: 'movie',
                        genre_names: this.getGenreNames('movie', details.genres?.map(g => g.id) || []),
                        vote_average: details.vote_average,
                        vote_count: details.vote_count,
                        popularity: details.popularity,
                        from_tmdb_id: true // 标记这是通过TMDB ID直接获取的
                    };
                    
                    this.log.info(`✓ 通过TMDB ID ${tmdbId} 成功获取电影: ${result.title}`);
                    return result;
                }
                
            } catch (error) {
                if (error.response && error.response.status === 404) {
                    this.log.debug(`TMDB ID ${tmdbId} 在${type}类型中未找到`);
                    continue;
                } else {
                    this.log.error(`通过TMDB ID ${tmdbId} 获取${type}详情失败: ${error.message}`);
                    continue;
                }
            }
        }
        
        this.log.warn(`TMDB ID ${tmdbId} 未找到匹配的媒体信息`);
        return null;
    }

    /**
     * 根据配置类型和名称获取媒体详情
     * @param {string} primaryName - 主要名称（文件夹名或文件名）
     * @param {string} fallbackName - 回退名称
     * @param {string} mediaType - 媒体类型 ('movie', 'tv', 'mixed')
     * @returns {Promise<object|null>} 媒体详情或null
     */
    async getMediaDetails(primaryName, fallbackName = null, mediaType = 'mixed') {
        // 优先级最高：检查是否包含TMDB ID格式
        const tmdbIdInfo = this._extractTmdbId(primaryName);
        if (tmdbIdInfo) {
            this.log.info(`检测到TMDB ID格式: "${primaryName}" -> 标题: "${tmdbIdInfo.title}", TMDB ID: ${tmdbIdInfo.tmdbId}`);
            const result = await this._getDetailsByTmdbId(tmdbIdInfo.tmdbId, mediaType);
            if (result) {
                return result;
            }
            // 如果通过TMDB ID获取失败，继续使用标题搜索
            this.log.warn(`TMDB ID ${tmdbIdInfo.tmdbId} 获取失败，将使用标题 "${tmdbIdInfo.title}" 进行搜索`);
        }
        
        // 如果没有TMDB ID或获取失败，则检查回退名称
        if (!tmdbIdInfo && fallbackName) {
            const fallbackTmdbIdInfo = this._extractTmdbId(fallbackName);
            if (fallbackTmdbIdInfo) {
                this.log.info(`在回退名称中检测到TMDB ID格式: "${fallbackName}" -> 标题: "${fallbackTmdbIdInfo.title}", TMDB ID: ${fallbackTmdbIdInfo.tmdbId}`);
                const result = await this._getDetailsByTmdbId(fallbackTmdbIdInfo.tmdbId, mediaType);
                if (result) {
                    return result;
                }
                this.log.warn(`回退名称的TMDB ID ${fallbackTmdbIdInfo.tmdbId} 获取失败，将继续常规搜索`);
            }
        }
        
        // 尝试初始化，但不强制要求成功
        if (!this.initialized) {
            await this.initialize().catch(() => {
                this.log.warn('获取媒体详情时初始化失败，将继续执行但无流派信息');
            });
        }
        
        // 生成多个标题候选
        const titleCandidates = [];
        
        // 如果有TMDB ID信息，优先使用提取的标题
        if (tmdbIdInfo) {
            titleCandidates.push(...this._smartCleanFileName(tmdbIdInfo.title));
        } else {
            // 从主要名称提取候选标题
            titleCandidates.push(...this._smartCleanFileName(primaryName));
        }
        
        // 从回退名称提取候选标题
        if (fallbackName) {
            const fallbackTmdbIdInfo = this._extractTmdbId(fallbackName);
            if (fallbackTmdbIdInfo) {
                titleCandidates.push(...this._smartCleanFileName(fallbackTmdbIdInfo.title));
            } else {
                titleCandidates.push(...this._smartCleanFileName(fallbackName));
            }
        }
        
        // 去重并过滤有效候选
        const uniqueCandidates = [...new Set(titleCandidates)].filter(title => 
            title && title.length >= 2 && this._filterMeaninglessKeywords(title)
        );
        
        if (uniqueCandidates.length === 0) {
            this.log.warn(`跳过无意义的搜索词: ${primaryName}`);
            return null;
        }

        this.log.debug(`生成的搜索候选: ${uniqueCandidates.join(', ')}`);

        // 使用智能多语言搜索
        const selectedItem = await this._smartMultiLanguageSearch(uniqueCandidates, mediaType);
        
        if (!selectedItem) {
            this.log.warn(`TMDb 未找到匹配结果: ${uniqueCandidates.join(', ')} (来源: ${primaryName})`);
            return null;
        }

        try {
            // 根据媒体类型获取详细信息
            const resultMediaType = selectedItem.media_type;
            const itemId = selectedItem.id;

            // 如果是电视剧，获取完整的电视剧信息
            if (resultMediaType === 'tv') {
                try {
                    const tvDetails = await this.getTVDetails(itemId);
                    if (tvDetails) {
                        // 返回完整的电视剧信息，确保包含所有必要字段
                        const completeResult = {
                            // 基础信息
                            id: tvDetails.id,
                            name: this._cleanText(tvDetails.name),
                            original_name: this._cleanText(tvDetails.original_name),
                            title: this._cleanText(tvDetails.name), // 统一使用title字段
                            overview: this._cleanText(tvDetails.overview),
                            poster_path: tvDetails.poster_path,
                            backdrop_path: tvDetails.backdrop_path,
                            first_air_date: tvDetails.first_air_date,
                            last_air_date: tvDetails.last_air_date,
                            origin_country: tvDetails.origin_country || [],
                            
                            // 分类与评分
                            genres: tvDetails.genres || [],
                            genre_names: this.getGenreNames('tv', tvDetails.genres?.map(g => g.id) || []),
                            vote_average: tvDetails.vote_average || 0,
                            vote_count: tvDetails.vote_count || 0,
                            popularity: tvDetails.popularity || 0,
                            status: tvDetails.status,
                            
                            // 制作与发行信息
                            production_companies: tvDetails.production_companies || [],
                            production_countries: tvDetails.production_countries || [],
                            networks: tvDetails.networks || [],
                            original_language: tvDetails.original_language,
                            languages: tvDetails.languages || [],
                            
                            // 剧集与季数信息
                            number_of_seasons: tvDetails.number_of_seasons || 0,
                            number_of_episodes: tvDetails.number_of_episodes || 0,
                            seasons: tvDetails.seasons || [],
                            
                            // 其他扩展字段
                            created_by: tvDetails.created_by || [],
                            episode_run_time: tvDetails.episode_run_time || [],
                            homepage: tvDetails.homepage,
                            in_production: tvDetails.in_production || false,
                            tagline: this._cleanText(tvDetails.tagline),
                            type: tvDetails.type,
                            adult: tvDetails.adult || false,
                            
                            // 剧集信息
                            last_episode_to_air: tvDetails.last_episode_to_air,
                            next_episode_to_air: tvDetails.next_episode_to_air,
                            
                            // 语言信息
                            spoken_languages: tvDetails.spoken_languages || [],
                            
                            // 统一字段
                            media_type: 'tv',
                            release_date: tvDetails.first_air_date,
                            
                            // 附加信息（如果存在）
                            content_ratings: tvDetails.content_ratings,
                            credits: tvDetails.credits,
                            external_ids: tvDetails.external_ids,
                            keywords: tvDetails.keywords,
                            recommendations: tvDetails.recommendations,
                            similar: tvDetails.similar,
                            videos: tvDetails.videos
                        };
                        
                        this.log.info(`✓ 获取到完整电视剧信息: ${completeResult.title} (${completeResult.number_of_seasons}季${completeResult.number_of_episodes}集)`);
                        return completeResult;
                    }
                } catch (error) {
                    this.log.warn(`获取电视剧详细信息失败，使用基础信息: ${error.message}`);
                }
            }

            // 电影或获取电视剧详细信息失败时的回退处理
            let detailsResponse;
            if (resultMediaType === 'movie') {
                detailsResponse = await this.api.get(`/movie/${itemId}`, {
                    params: {
                        api_key: this.token,
                        language: this.language,
                    },
                    timeout: 15000
                });
            } else if (resultMediaType === 'tv') {
                detailsResponse = await this.api.get(`/tv/${itemId}`, {
                    params: {
                        api_key: this.token,
                        language: this.language,
                    },
                    timeout: 15000
                });
            } else {
                this.log.warn(`不支持的媒体类型: ${resultMediaType}`);
                return null;
            }

            const details = detailsResponse.data;
            
            // 如果是电视剧，尝试获取内容分级
            let contentRatings = null;
            if (resultMediaType === 'tv') {
                try {
                    contentRatings = await this.getTVContentRatings(details.id);
                } catch (error) {
                    this.log.warn(`获取内容分级失败: ${error.message}`);
                }
            }
            
            // 统一返回格式，确保字符串正确编码
            return {
                id: details.id,
                title: this._cleanText(details.title || details.name),
                overview: this._cleanText(details.overview),
                poster_path: details.poster_path,
                release_date: details.release_date || details.first_air_date,
                media_type: resultMediaType,
                genre_names: this.getGenreNames(resultMediaType, details.genres?.map(g => g.id) || []),
                vote_average: details.vote_average,
                vote_count: details.vote_count,
                popularity: details.popularity,
                content_ratings: contentRatings?.results || null
            };

        } catch (error) {
            this.log.error(`获取详细信息失败 (ID: ${selectedItem.id}): ${error.message}`);
            return null;
        }
    }

    /**
     * 专门搜索电影
     * @param {string} query - 搜索关键词
     * @param {object} options - 搜索选项
     * @returns {Promise<object|null>} 电影搜索结果
     */
    async searchMovie(query, options = {}) {
        // 尝试初始化，但不强制要求成功
        if (!this.initialized) {
            await this.initialize().catch(() => {
                this.log.warn('搜索时初始化失败，将继续执行但无流派信息');
            });
        }
        
        const {
            include_adult = false,
            page = 1
        } = options;

        try {
            const response = await this.api.get('/search/movie', {
                params: {
                    api_key: this.token,
                    query: query,
                    include_adult: include_adult,
                    language: this.language,
                    page: page,
                },
                timeout: 15000
            });

            if (!response.data.results || response.data.results.length === 0) {
                return null;
            }

            // 获取第一个结果并添加详细信息
            const movie = response.data.results[0];
            
            // 获取完整的电影详情
            const detailsResponse = await this.api.get(`/movie/${movie.id}`, {
                params: {
                    api_key: this.token,
                    language: this.language,
                },
                timeout: 15000
            });

            const details = detailsResponse.data;
            
            return {
                id: details.id,
                title: this._cleanText(details.title),
                overview: this._cleanText(details.overview),
                poster_path: details.poster_path,
                backdrop_path: details.backdrop_path,
                release_date: details.release_date,
                media_type: 'movie',
                genres: details.genres || [],
                genre_names: this.getGenreNames('movie', details.genres?.map(g => g.id) || []),
                vote_average: details.vote_average || 0,
                vote_count: details.vote_count || 0,
                popularity: details.popularity || 0,
                adult: details.adult || false,
                original_language: details.original_language,
                original_title: this._cleanText(details.original_title),
                production_companies: details.production_companies || [],
                production_countries: details.production_countries || [],
                runtime: details.runtime,
                spoken_languages: details.spoken_languages || [],
                status: details.status,
                tagline: this._cleanText(details.tagline),
                budget: details.budget || 0,
                revenue: details.revenue || 0,
                homepage: details.homepage
            };

        } catch (error) {
            this.log.error(`电影搜索失败 "${query}": ${error.message}`);
            if (error.response) {
                this.log.error(`TMDb API 响应: ${error.response.status} ${JSON.stringify(error.response.data)}`);
            }
            return null;
        }
    }

    /**
     * 专门搜索电视剧
     * @param {string} query - 搜索关键词
     * @param {object} options - 搜索选项
     * @returns {Promise<object|null>} 电视剧搜索结果
     */
    async searchTv(query, options = {}) {
        // 尝试初始化，但不强制要求成功
        if (!this.initialized) {
            await this.initialize().catch(() => {
                this.log.warn('搜索时初始化失败，将继续执行但无流派信息');
            });
        }
        
        const {
            include_adult = false,
            page = 1
        } = options;

        try {
            const response = await this.api.get('/search/tv', {
                params: {
                    api_key: this.token,
                    query: query,
                    include_adult: include_adult,
                    language: this.language,
                    page: page,
                },
                timeout: 15000
            });

            if (!response.data.results || response.data.results.length === 0) {
                return null;
            }

            // 获取第一个结果并获取完整的电视剧信息
            const tvShow = response.data.results[0];
            
            // 使用已有的 getTVDetails 方法获取完整信息
            const tvDetails = await this.getTVDetails(tvShow.id);
            
            if (tvDetails) {
                return {
                    ...tvDetails,
                    title: this._cleanText(tvDetails.name), // 统一使用title字段
                    media_type: 'tv',
                    genre_names: this.getGenreNames('tv', tvDetails.genres?.map(g => g.id) || []),
                    release_date: tvDetails.first_air_date
                };
            }

            return null;

        } catch (error) {
            this.log.error(`电视剧搜索失败 "${query}": ${error.message}`);
            if (error.response) {
                this.log.error(`TMDb API 响应: ${error.response.status} ${JSON.stringify(error.response.data)}`);
            }
            return null;
        }
    }

    /**
     * 保持向后兼容的 getMovieDetails 方法
     * @param {string} videoName - 视频文件名
     * @returns {Promise<object|null>} 电影详情或null
     */
    async getMovieDetails(videoName) {
        return this.getMediaDetails(videoName, null, 'movie');
    }

    /**
     * 清理文本，移除控制字符和特殊字符
     * @param {string} text - 需要清理的文本
     * @returns {string} 清理后的文本
     * @private
     */
    _cleanText(text) {
        if (!text || typeof text !== 'string') {
            return '';
        }
        
        return text
            // 移除控制字符 (0x00-0x1F, 0x7F-0x9F)
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
            // 移除BOM字符
            .replace(/\uFEFF/g, '')
            // 替换行分隔符和段分隔符为普通空格
            .replace(/[\u2028\u2029]/g, ' ')
            // 规范化空白字符
            .replace(/\s+/g, ' ')
            .trim();
    }
}

module.exports = TMDbAPI;
