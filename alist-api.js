const axios = require('axios');
const path = require('path');

class AlistAPI {
    constructor(config, log) {
        this.config = config;
        this.log = log;
        this.token = null;
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

    async getAllVideoFiles(directories) {
        if (!this.token) {
            await this._login();
        }

        const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.rmvb', '.flv', '.wmv'];
        const allVideoFiles = [];

        const findVideosRecursively = async (currentPath) => {
            this.log.info(`Scanning Alist path: ${currentPath}`);
            const items = await this._getFiles(currentPath);
            if (!items) return;

            for (const item of items) {
                // **关键修复**：只对 is_dir 为 true 的项进行递归
                if (item.is_dir) {
                    const nextPath = path.posix.join(currentPath, item.name);
                    await findVideosRecursively(nextPath);
                } else {
                    const extension = path.extname(item.name).toLowerCase();
                    if (videoExtensions.includes(extension)) {
                        const fileFullPath = path.posix.join(currentPath, item.name);
                        const fileUrl = `${this.config.url}/d${encodeURI(fileFullPath)}${item.sign ? `?sign=${item.sign}` : ''}`;
                        allVideoFiles.push({
                            name: item.name,
                            url: fileUrl,
                            path: fileFullPath,
                        });
                    }
                }
            }
        };

        for (const dir of directories) {
            await findVideosRecursively(dir);
        }

        return allVideoFiles;
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