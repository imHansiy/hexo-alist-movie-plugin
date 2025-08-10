const axios = require('axios');

class TMDbAPI {
    constructor(token, log, language = 'zh-CN') {
        this.token = token;
        this.log = log;
        this.language = language;
        this.api = axios.create({
            baseURL: 'https://api.themoviedb.org/3',
        });
    }

    /**
     * Cleans up the video name to extract a searchable movie title.
     * @param {string} videoName - The original file name of the video.
     * @returns {string} A cleaned-up movie title.
     * @private
     */
    _cleanupName(videoName) {
        // 移除文件扩展名、年份、分辨率等常见标记
        return videoName
            .replace(/\.(mp4|mkv|avi|mov|wmv)$/i, '') // 移除扩展名
            .replace(/\b(1080p|720p|4k|hd|uhd)\b/i, '') // 移除分辨率
            .replace(/\b(19|20)\d{2}\b/g, '') // 移除年份
            .replace(/[\[【](.*?)[\]】]/g, '') // 移除括号内容
            .replace(/[-._\s]+/g, ' ') // 用空格替换分隔符
            .trim();
    }

    /**
     * Fetches movie details from TMDb.
     * @param {string} videoName - The name of the video file.
     * @returns {Promise<object|null>} A promise that resolves to an object with movie details or null.
     */
    async getMovieDetails(videoName) {
        const cleanedName = this._cleanupName(videoName);
        if (!cleanedName) {
            this.log.warn(`Skipping video with empty name after cleanup: ${videoName}`);
            return null;
        }

        try {
            // 1. Search for the movie
            const searchResponse = await this.api.get('/search/movie', {
                params: {
                    api_key: this.token,
                    query: cleanedName,
                    language: this.language,
                },
            });

            if (!searchResponse.data.results || searchResponse.data.results.length === 0 || !searchResponse.data.results[0] || !searchResponse.data.results[0].id) {
                this.log.warn(`No valid TMDb results found for: ${cleanedName} (from ${videoName}). Invalid ID or no results.`);
                return null;
            }

            const movie = searchResponse.data.results[0];
            const movieId = movie.id;

            this.log.debug(`Fetching details for movie '${cleanedName}' with TMDb ID: ${movieId}`);

            // 2. Fetch movie details by ID
            const detailsResponse = await this.api.get(`/movie/${movieId}`, {
                params: {
                    api_key: this.token,
                    language: this.language,
                },
            });

            const { id, title, overview, poster_path, release_date } = detailsResponse.data;
            return { id, title, overview, poster_path, release_date };

        } catch (error) {
            this.log.error(`Error fetching TMDb details for ${cleanedName}: ${error.message}`);
            if (error.response) {
                this.log.error(`TMDb API Response: ${error.response.status} ${JSON.stringify(error.response.data)}`);
            }
            return null;
        }
    }
}

module.exports = TMDbAPI;