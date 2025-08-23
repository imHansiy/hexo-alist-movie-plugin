const axios = require('axios');
const path = require('path');

class AlistAPI {
    constructor(config, log) {
        this.config = config;
        this.log = log;
        this.token = null;
        this.baseUrl = config.url; // 添加baseUrl属性
    }

    async _login() {
        try {
            const response = await axios.post(`${this.config.url}/api/auth/login`, {
                username: this.config.username,
                password: this.config.password,
            });
            this.token = response.data.data.token;
            this.log.info('Alist login successful.');
        } catch (error) {
            this.log.error('Alist login failed:', error.message);
            throw error;
        }
    }

    async _getFiles(currentPath) {
        if (!this.token) {
            await this._login();
        }
        try {
            const response = await axios.post(`${this.config.url}/api/fs/list`,
                {
                    path: currentPath,
                    password: "",
                    page: 1,
                    per_page: 0,
                    refresh: false,
                },
                {
                    headers: {
                        Authorization: this.token,
                    },
                }
            );
            return response.data.data.content;
        } catch (error) {
            this.log.error(`Failed to get files from ${currentPath}:`, error.message);
            return [];
        }
    }

    // 为智能识别系统添加兼容方法
    async listDirectory(currentPath) {
        return await this._getFiles(currentPath);
    }

    async getAllVideoFiles(directoriesConfig) {
        if (!this.token) {
            await this._login();
        }

        const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.rmvb', '.flv', '.wmv', '.m4v', '.webm'];
        const allVideoFiles = [];

        const findVideosRecursively = async (currentPath, parentInfo = {}, depth = 0) => {
            this.log.info(`[深度${depth}] 扫描路径: ${currentPath}`);
            
            try {
                const items = await this._getFiles(currentPath);
                if (!items || items.length === 0) {
                    this.log.warn(`路径 ${currentPath} 为空或无法访问`);
                    return;
                }

                this.log.info(`在 ${currentPath} 找到 ${items.length} 个项目`);

                for (const item of items) {
                    const itemPath = path.posix.join(currentPath, item.name);
                    
                    if (item.is_dir) {
                        this.log.info(`发现文件夹: ${item.name}`);
                        
                        // 检测是否为季文件夹 (Season 1, S01, 第一季等)
                        const seasonMatch = item.name.match(/(?:Season|S|第)[\s]*(\d+)(?:季)?/i);
                        const newParentInfo = seasonMatch ? 
                            { ...parentInfo, season: parseInt(seasonMatch[1]) } : 
                            { ...parentInfo };
                        
                        // 递归扫描子文件夹，不限制深度
                        await findVideosRecursively(itemPath, newParentInfo, depth + 1);
                    } else {
                        const extension = path.extname(item.name).toLowerCase();
                        if (videoExtensions.includes(extension)) {
                            this.log.info(`发现视频文件: ${item.name}`);
                            
                            const fileUrl = `${this.config.url}/d${encodeURI(itemPath)}${item.sign ? `?sign=${item.sign}` : ''}`;
                            
                            // 检测集数信息 (E01, EP01, 第1集等)
                            const episodeMatch = item.name.match(/(?:E|EP|第)[\s]*(\d+)(?:集)?/i);
                            const episode = episodeMatch ? parseInt(episodeMatch[1]) : null;
                            
                            allVideoFiles.push({
                                name: item.name,
                                url: fileUrl,
                                path: itemPath,
                                season: parentInfo.season || null,
                                episode: episode,
                                // 使用强制指定的名称或提取剧集名称
                                seriesName: parentInfo.forcedTitle || this._extractSeriesName(currentPath, item.name),
                                // 添加目录类型信息
                                directoryType: parentInfo.directoryType || 'mixed',
                                // 保存强制指定的标题信息
                                forcedTitle: parentInfo.forcedTitle || null
                            });
                        } else {
                            this.log.debug(`跳过非视频文件: ${item.name} (扩展名: ${extension})`);
                        }
                    }
                }
            } catch (error) {
                this.log.error(`扫描路径 ${currentPath} 时出错:`, error.message);
            }
        };

        for (const dirConfig of directoriesConfig) {
            const { path: dirPath, type, title, season_depth } = dirConfig;
            this.log.info(`开始扫描配置目录: ${dirPath} (类型: ${type})`);
            
            const parentInfo = { 
                directoryType: type,
                forcedTitle: title, // 强制指定的影片名称
                seasonDepth: season_depth || 1
            };
            
            await findVideosRecursively(dirPath, parentInfo, 0);
        }

        this.log.info(`总共扫描到 ${allVideoFiles.length} 个视频文件`);
        return allVideoFiles;
    }

    /**
     * 从路径和文件名中提取剧集名称
     */
    _extractSeriesName(filePath, fileName) {
        const pathParts = filePath.split('/').filter(Boolean);
        // 优先使用倒数第二级目录作为剧集名（通常是剧名文件夹）
        if (pathParts.length >= 2) {
            const seriesFolder = pathParts[pathParts.length - 2];
            // 如果不是季文件夹，则使用该文件夹名
            if (!seriesFolder.match(/(?:Season|S|第)[\s]*\d+(?:季)?/i)) {
                return seriesFolder;
            }
        }
        // 否则使用最后一级目录或文件名
        return pathParts[pathParts.length - 1] || fileName.replace(/\.[^.]+$/, '');
    }

    async createPublicShare(path) {
        if (!this.token) {
            await this._login();
        }
        try {
            const response = await axios.post(
                `${this.config.url}/api/fs/share`,
                { path: path, expires: 0 },
                {
                    headers: {
                        Authorization: this.token,
                    },
                }
            );
            this.log.info(`Created public share for: ${path}`);
            // 修复：检查 response.data.data 是否存在，并使用 raw_url
            if (response.data && response.data.data && response.data.data.raw_url) {
                return response.data.data.raw_url;
            }
            // Alist v3.31.0+ 的响应结构可能不同
            if (response.data && response.data.raw_url) {
                return response.data.raw_url;
            }
            this.log.error(`Failed to create public share for ${path}: raw_url not found in response.`);
            return null;
        } catch (error) {
            // 增加对错误响应的详细记录
            const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
            this.log.error(`Failed to create public share for ${path}:`, errorMessage);
            return null;
        }
    }
}

module.exports = AlistAPI;