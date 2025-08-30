// 全局变量
let player;
let currentMovie = null;
let currentEpisode = null;
let currentSource = null;

// 从movies.json加载电影数据
async function loadMovieFromJson(movieId) {
    try {
        console.log('尝试从movies.json加载电影数据:', movieId);

        // 尝试多个可能的路径
        const possiblePaths = [
            '../data/movies.json',
            '../../data/movies.json',
            '/data/movies.json',
            '../../../source/data/movies.json'
        ];

        let moviesData = null;

        for (const path of possiblePaths) {
            try {
                const response = await fetch(path);
                if (response.ok) {
                    moviesData = await response.json();
                    console.log('成功从路径加载数据:', path);
                    break;
                }
            } catch (e) {
                console.log('尝试路径失败:', path, e.message);
            }
        }

        if (!moviesData || !moviesData.movies) {
            throw new Error('无法加载movies.json数据');
        }

        // 查找对应的电影
        const movie = moviesData.movies.find(m =>
            m.id === movieId ||
            m.id === parseInt(movieId) ||
            m.original_tmdb_id === parseInt(movieId)
        );

        if (!movie) {
            throw new Error(`未找到ID为 ${movieId} 的电影`);
        }

        console.log('找到电影数据:', movie.title);
        currentMovie = movie;

        // 初始化播放器
        initializeMoviePlayer();

    } catch (error) {
        console.error('加载电影数据失败:', error);
        showError(`加载电影数据失败: ${error.message}`);
        hideLoadingState();
    }
}

// 初始化电影播放器（从loadMovieFromJson调用）
function initializeMoviePlayer() {
    try {
        // 更新电影信息显示
        updateMovieInfo();

        // 动态创建选集和片源列表
        createEpisodesAndSourcesList();

        // 初始化 Plyr 播放器
        initializePlayer();

        // 设置默认播放源
        setDefaultSource();

        // 绑定选集/片源切换事件
        bindSourceEvents();

        // 添加键盘快捷键提示
        showKeyboardShortcuts();

        // 隐藏加载状态
        hideLoadingState();

    } catch (error) {
        console.error('初始化失败:', error);
        showError('播放器初始化失败，请刷新页面重试');
        hideLoadingState();
    }
}

// 动态创建选集和片源列表
function createEpisodesAndSourcesList() {
    // 找到右侧推荐列表区域
    const recommendationsSection = document.querySelector('.recommendations');
    if (!recommendationsSection) {
        console.warn('未找到推荐列表区域');
        return;
    }

    // 清空现有内容
    recommendationsSection.innerHTML = '';

    if (currentMovie.media_type === 'tv' && currentMovie.seasons && currentMovie.seasons.length > 0) {
        // 电视剧：创建选集列表
        createEpisodesList(recommendationsSection);
    } else if (currentMovie.media_type === 'movie' && currentMovie.sources && currentMovie.sources.length > 0) {
        // 电影：创建片源列表
        createSourcesList(recommendationsSection);
    } else if (currentMovie.files && currentMovie.files.length > 0) {
        // 通用文件：创建文件列表
        createFilesList(recommendationsSection);
    } else if (currentMovie.is_aggregated && currentMovie.versions) {
        // 聚合内容：创建版本选择列表
        createVersionsList(recommendationsSection);
    }
}

// 创建电视剧选集列表
function createEpisodesList(container) {
    const episodesTitle = document.createElement('h3');
    episodesTitle.textContent = '选集列表';
    container.appendChild(episodesTitle);

    const seasonsContainer = document.createElement('div');
    seasonsContainer.className = 'seasons-container';

    currentMovie.seasons.forEach((season, seasonIndex) => {
        if (!season.episodes || season.episodes.length === 0) return;

        const seasonNumber = season.season_number || (seasonIndex + 1);

        // 季度标题
        const seasonTitle = document.createElement('h4');
        seasonTitle.textContent = `第 ${seasonNumber} 季`;
        seasonTitle.className = 'season-title';
        seasonsContainer.appendChild(seasonTitle);

        // 集数列表
        const episodesList = document.createElement('div');
        episodesList.className = 'episodes-list';

        season.episodes.forEach((episode, episodeIndex) => {
            const episodeItem = document.createElement('div');
            episodeItem.className = 'episode-item';
            episodeItem.dataset.season = seasonNumber;
            episodeItem.dataset.episode = episode.episode_number || (episodeIndex + 1);
            episodeItem.dataset.name = episode.name || `第 ${episode.episode_number || (episodeIndex + 1)} 集`;
            episodeItem.dataset.url = episode.url;

            episodeItem.innerHTML = `
                <span style="font-weight: 600; min-width: 40px;">E${episode.episode_number || (episodeIndex + 1)}</span>
                <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${episode.name || ''}</span>
            `;

            episodesList.appendChild(episodeItem);
        });

        seasonsContainer.appendChild(episodesList);
    });

    container.appendChild(seasonsContainer);
}

// 创建电影片源列表
function createSourcesList(container) {
    const sourcesTitle = document.createElement('h3');
    sourcesTitle.textContent = '片源列表';
    container.appendChild(sourcesTitle);

    const sourcesList = document.createElement('div');
    sourcesList.className = 'sources-list';

    currentMovie.sources.forEach((source, index) => {
        const sourceItem = document.createElement('div');
        sourceItem.className = 'source-item';
        sourceItem.dataset.url = source.url;
        sourceItem.dataset.quality = source.quality || '';
        sourceItem.dataset.format = source.format || '';
        sourceItem.dataset.name = source.name || `片源 ${index + 1}`;
        sourceItem.dataset.source = source.sourceName || source.name || `片源 ${index + 1}`;

        const qualityInfo = source.quality ? ` (${source.quality})` : '';
        const formatInfo = source.format ? ` [${source.format}]` : '';

        sourceItem.innerHTML = `
            <div style="font-weight: 600;">${source.name || `片源 ${index + 1}`}${qualityInfo}${formatInfo}</div>
        `;

        sourcesList.appendChild(sourceItem);
    });

    container.appendChild(sourcesList);
}

// 创建文件列表
function createFilesList(container) {
    const filesTitle = document.createElement('h3');
    filesTitle.textContent = '文件列表';
    container.appendChild(filesTitle);

    const filesContainer = document.createElement('div');
    filesContainer.id = 'files-container';
    filesContainer.className = 'files-list';

    currentMovie.files.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.dataset.url = file.url;
        fileItem.dataset.name = file.name;
        fileItem.dataset.path = file.path;

        const sizeInfo = file.size ? ` (${(file.size / 1024 / 1024 / 1024).toFixed(2)} GB)` : '';

        fileItem.innerHTML = `
            <div style="font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${file.name}${sizeInfo}</div>
        `;

        filesContainer.appendChild(fileItem);
    });

    container.appendChild(filesContainer);
}

// 初始化播放器 - 优化加载体验
document.addEventListener('DOMContentLoaded', function () {
    showLoadingState();

    const processMovieData = (movie) => {
        if (!movie) {
            console.error('未找到电影数据');
            showError('未找到电影数据，请刷新页面重试');
            hideLoadingState();
            return;
        }
        console.log('获取电影数据:', movie.title);
        currentMovie = movie;
        try {
            initializeMoviePlayer();
        } catch (error) {
            console.error('初始化失败:', error);
            showError('播放器初始化失败，请刷新页面重试');
            hideLoadingState();
        }
    };

    if (window.movieData) {
        processMovieData(window.movieData);
    } else {
        const urlParams = new URLSearchParams(window.location.search);
        const movieId = urlParams.get('movie_id') || urlParams.get('id');
        if (movieId) {
            console.log('从URL参数获取电影ID:', movieId);
            loadMovieFromJson(movieId);
        } else {
            processMovieData(null);
        }
    }
});


// 显示加载状态
function showLoadingState() {
    const playerContainer = document.querySelector('.player-container');
    if (playerContainer) {
        let overlay = playerContainer.querySelector('.init-loading-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'init-loading-overlay';
            overlay.style.cssText = `
                position: absolute;
                inset: 0;
                background: rgba(248, 249, 250, 0.95);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
                border-radius: var(--radius);
            `;
            overlay.innerHTML = `
                <div style="text-align: center; color: var(--secondary-color);">
                    <div>正在加载播放器...</div>
                </div>
            `;
            if (getComputedStyle(playerContainer).position === 'static') {
                playerContainer.style.position = 'relative';
            }
            playerContainer.appendChild(overlay);
        } else {
            overlay.style.display = 'flex';
        }
    }
}

// 隐藏加载状态
function hideLoadingState() {
    const overlay = document.querySelector('.player-container .init-loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// 显示键盘快捷键提示
function showKeyboardShortcuts() {
    const shortcutsInfo = document.createElement('div');
    shortcutsInfo.className = 'shortcuts-info';
    shortcutsInfo.innerHTML = `
        <div style="position: fixed; bottom: 20px; left: 20px; background: rgba(0,0,0,0.8); color: white; padding: 12px 16px; border-radius: 8px; font-size: 0.8rem; z-index: 1000; opacity: 0; transition: opacity 0.3s ease;">
            <div style="margin-bottom: 4px;"><strong>快捷键:</strong></div>
            <div>空格: 播放/暂停 | ←→: 快退/快进 | ↑↓: 音量 | F: 全屏 | N: 下一集</div>
        </div>
    `;

    document.body.appendChild(shortcutsInfo);

    // 3秒后显示，5秒后隐藏
    setTimeout(() => {
        shortcutsInfo.firstElementChild.style.opacity = '1';
        setTimeout(() => {
            shortcutsInfo.firstElementChild.style.opacity = '0';
            setTimeout(() => {
                if (shortcutsInfo.parentNode) {
                    shortcutsInfo.parentNode.removeChild(shortcutsInfo);
                }
            }, 300);
        }, 5000);
    }, 3000);
}

// 更新电影信息显示
function updateMovieInfo() {
    // 加载封面图片
    loadMoviePoster();

    // 更新标题
    const titleElement = document.querySelector('.movie-title');
    if (titleElement) {
        titleElement.textContent = currentMovie.title;

        // 如果是电视剧，添加原始名称
        if (currentMovie.media_type === 'tv' && currentMovie.original_name && currentMovie.original_name !== currentMovie.title) {
            const originalTitle = document.createElement('span');
            originalTitle.className = 'original-title';
            originalTitle.textContent = `(${currentMovie.original_name})`;
            titleElement.appendChild(originalTitle);
        }
    }

    // 更新详细信息
    const detailsElement = document.querySelector('.movie-details');
    if (detailsElement) {
        detailsElement.innerHTML = '';

        // 媒体类型标签
        const mediaTypeBadge = document.createElement('span');
        mediaTypeBadge.className = `media-type-badge ${currentMovie.media_type}`;
        mediaTypeBadge.textContent = currentMovie.media_type === 'tv' ? '电视剧' : '电影';
        detailsElement.appendChild(mediaTypeBadge);

        if (currentMovie.media_type === 'tv') {
            // 电视剧信息
            if (currentMovie.first_air_date) {
                const airDate = document.createElement('span');
                airDate.textContent = `📅 首播: ${currentMovie.first_air_date}`;
                detailsElement.appendChild(airDate);
            }
            if (currentMovie.number_of_seasons && currentMovie.number_of_episodes) {
                const episodeCount = document.createElement('span');
                episodeCount.textContent = `📺 ${currentMovie.number_of_seasons}季${currentMovie.number_of_episodes}集`;
                detailsElement.appendChild(episodeCount);
            }
            if (currentMovie.status) {
                const statusTag = document.createElement('span');
                statusTag.className = `status-tag ${currentMovie.status.toLowerCase().replace(/\s+/g, '-')}`;
                statusTag.textContent = currentMovie.status;
                detailsElement.appendChild(statusTag);
            }
        } else {
            // 电影信息
            if (currentMovie.release_date) {
                const releaseDate = document.createElement('span');
                releaseDate.textContent = `📅 ${currentMovie.release_date}`;
                detailsElement.appendChild(releaseDate);
            }
        }

        // 评分
        if (currentMovie.vote_average && currentMovie.vote_average > 0) {
            const rating = document.createElement('span');
            rating.textContent = `⭐ ${currentMovie.vote_average.toFixed(1)}`;
            detailsElement.appendChild(rating);
        }

        // 类型
        if (currentMovie.genre_names && currentMovie.genre_names.length > 0) {
            const genres = document.createElement('span');
            genres.textContent = `🎭 ${currentMovie.genre_names.join(', ')}`;
            detailsElement.appendChild(genres);
        }
    }

    // 更新剧情简介
    const overviewElement = document.querySelector('.movie-overview');
    if (overviewElement) {
        overviewElement.textContent = currentMovie.overview || '暂无简介';
    }

    // 更新电视剧额外信息
    ['tagline', 'countries', 'networks', 'companies', 'creators', 'runtime', 'language', 'languages'].forEach(type => {
        const box = document.querySelector(`.movie-${type}-box`);
        if (box) box.style.display = 'none';
    });

    if (currentMovie.media_type === 'tv') {
        if (currentMovie.tagline) {
            const box = document.querySelector('.movie-tagline-box');
            if (box) {
                box.style.display = 'block';
                box.querySelector('.movie-tagline').textContent = `"${currentMovie.tagline}"`;
            }
        }
    }
}

// 初始化播放器
function initializePlayer() {
    const videoElement = document.getElementById('player');

    player = new Plyr(videoElement, {
        controls: [
            'play-large',
            'play',
            'progress',
            'current-time',
            'duration',
            'mute',
            'volume',
            'settings',
            'fullscreen'
        ],
        settings: ['quality', 'speed'],
        quality: {
            default: 1080,
            options: [4320, 2880, 2160, 1440, 1080, 720, 576, 480, 360, 240]
        },
        speed: {
            selected: 1,
            options: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
        }
    });

    // 播放器事件监听
    player.on('ready', function () {
        console.log('播放器已准备就绪');
    });

    player.on('error', function (event) {
        console.error('播放器错误:', event);
        showError('视频加载失败，请尝试其他片源');
    });

    player.on('ended', function () {
        // 自动播放下一集或下一个片源
        playNext();
    });
}

// 设置默认播放源
function setDefaultSource() {
    let defaultUrl = null;

    if (currentMovie.is_aggregated && currentMovie.versions) {
        const mainVersion = currentMovie.versions.find(v => v.is_main) || currentMovie.versions[0];
        if (mainVersion) {
            currentMovie = { ...currentMovie, ...mainVersion, is_aggregated: false };
        }
    }

    if (currentMovie.seasons && currentMovie.seasons.length > 0) {
        const firstSeason = currentMovie.seasons[0];
        if (firstSeason.episodes && firstSeason.episodes.length > 0) {
            const firstEpisode = firstSeason.episodes[0];
            defaultUrl = firstEpisode.url;
            const seasonNumber = firstSeason.season_number || 1;
            currentEpisode = {
                season: seasonNumber,
                episode: firstEpisode.episode_number,
                name: firstEpisode.name,
                url: firstEpisode.url
            };
            highlightCurrentEpisode(seasonNumber, firstEpisode.episode_number);
        }
    } else if (currentMovie.sources && currentMovie.sources.length > 0) {
        const firstSource = currentMovie.sources[0];
        defaultUrl = firstSource.url;
        currentSource = firstSource;
        highlightCurrentSource(0);
    } else if (currentMovie.files && currentMovie.files.length > 0) {
        const firstFile = currentMovie.files[0];
        defaultUrl = firstFile.url;
        highlightCurrentFile(0);
    } else {
        showError('未找到可播放的视频文件。');
        return;
    }

    if (defaultUrl) {
        loadVideo(defaultUrl);
    } else {
        showError('未能确定播放地址，请检查数据完整性');
    }
}

// 加载视频
function loadVideo(url) {
    if (!player || !url) {
        showError('播放器未准备就绪，请刷新页面重试');
        return;
    }

    showVideoLoadingState();

    const loadingTimeout = setTimeout(() => {
        showError('视频加载超时，请检查网络连接或尝试其他片源');
        hideVideoLoadingState();
    }, 30000); // 30秒超时

    const playerContainer = document.querySelector('.player-container');

    const onCanPlay = () => {
        clearTimeout(loadingTimeout);
        hideVideoLoadingState();
        showSuccessToast('视频加载成功');
        if (playerContainer) playerContainer.classList.add('video-loaded');
        player.media.removeEventListener('canplay', onCanPlay);
    };

    player.media.addEventListener('canplay', onCanPlay);
    if (playerContainer) playerContainer.classList.remove('video-loaded');

    if (url.includes('.m3u8')) {
        if (Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(url);
            hls.attachMedia(player.media);
        } else if (player.media.canPlayType('application/vnd.apple.mpegurl')) {
            player.source = { type: 'video', sources: [{ src: url, type: 'application/vnd.apple.mpegurl' }] };
        }
    } else {
        // --- BUG FIX START ---
        // 1. 从URL中移除查询参数（?sign=...）以正确提取扩展名
        const cleanUrl = url.split('?')[0];
        // 2. 从清理后的URL中获取扩展名
        const extension = cleanUrl.split('.').pop().toLowerCase();
        // --- BUG FIX END ---

        const typeMap = { 'mkv': 'video/webm' }; // Plyr may need help with MKV
        player.source = { type: 'video', sources: [{ src: url, type: typeMap[extension] || `video/${extension}` }] };
    }
}


// 显示视频加载状态
function showVideoLoadingState() {
    const playerContainer = document.querySelector('.player-container');
    if (!playerContainer) return;

    let loadingOverlay = playerContainer.querySelector('.video-loading-overlay');
    if (!loadingOverlay) {
        loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'video-loading-overlay';
        loadingOverlay.style.cssText = `
            position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(248, 249, 250, 0.95); display: flex; align-items: center;
            justify-content: center; z-index: 1000; backdrop-filter: blur(2px);
            border-radius: var(--radius);
        `;
        playerContainer.appendChild(loadingOverlay);
    }
    loadingOverlay.style.display = 'flex';
}

// 隐藏视频加载状态
function hideVideoLoadingState() {
    const loadingOverlay = document.querySelector('.video-loading-overlay');
    if (loadingOverlay) loadingOverlay.style.display = 'none';
}

// 显示成功提示Toast
function showSuccessToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; top: 80px; right: 24px; background: #10b981; color: white;
        padding: 12px 20px; border-radius: 8px; font-size: 0.875rem; font-weight: 500;
        z-index: 9999; transform: translateX(120%); transition: transform 0.3s ease;
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => { toast.style.transform = 'translateX(0)'; }, 100);
    setTimeout(() => {
        toast.style.transform = 'translateX(120%)';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// 绑定选集/片源切换事件
function bindSourceEvents() {
    document.querySelector('.recommendations').addEventListener('click', function (e) {
        const target = e.target.closest('.episode-item, .source-item, .file-item');
        if (!target || target.classList.contains('active')) return;

        let url, season, episode, name, index;

        if (target.classList.contains('episode-item')) {
            url = target.dataset.url;
            season = parseInt(target.dataset.season);
            episode = parseInt(target.dataset.episode);
            name = target.dataset.name;
            currentEpisode = { season, episode, name, url };
            highlightCurrentEpisode(season, episode);
            updatePageTitle(`${currentMovie.title} - S${season}E${episode}`);
        } else if (target.classList.contains('source-item')) {
            url = target.dataset.url;
            index = [...target.parentElement.children].indexOf(target);
            currentSource = currentMovie.sources[index];
            highlightCurrentSource(index);
            updatePageTitle(`${currentMovie.title} - ${currentSource.name}`);
        } else if (target.classList.contains('file-item')) {
            url = target.dataset.url;
            index = [...target.parentElement.children].indexOf(target);
            highlightCurrentFile(index);
            updatePageTitle(`${currentMovie.title} - ${target.dataset.name}`);
        }

        if (url) loadVideo(url);
    });
}


// 高亮当前选集
function highlightCurrentEpisode(season, episode) {
    document.querySelectorAll('.episode-item').forEach(item => item.classList.remove('active'));
    const currentItem = document.querySelector(`.episode-item[data-season="${season}"][data-episode="${episode}"]`);
    if (currentItem) {
        currentItem.classList.add('active');
        currentItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// 高亮当前片源
function highlightCurrentSource(index) {
    document.querySelectorAll('.source-item').forEach((item, i) => item.classList.toggle('active', i === index));
    const currentItem = document.querySelectorAll('.source-item')[index];
    if (currentItem) currentItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// 高亮当前文件
function highlightCurrentFile(index) {
    document.querySelectorAll('.file-item').forEach((item, i) => item.classList.toggle('active', i === index));
    const currentItem = document.querySelectorAll('.file-item')[index];
    if (currentItem) currentItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// 播放下一个
function playNext() {
    if (currentMovie.media_type === 'tv' && currentEpisode) {
        const nextEpisode = findNextEpisode(currentEpisode.season, currentEpisode.episode);
        if (nextEpisode) {
            currentEpisode = nextEpisode;
            loadVideo(nextEpisode.url);
            highlightCurrentEpisode(nextEpisode.season, nextEpisode.episode);
            updatePageTitle(`${currentMovie.title} - S${nextEpisode.season}E${nextEpisode.episode}`);
        }
    }
}

// 查找下一集
function findNextEpisode(currentSeason, currentEpisode) {
    for (const season of currentMovie.seasons) {
        if (season.season_number === currentSeason) {
            const currentIndex = season.episodes.findIndex(ep => ep.episode_number === currentEpisode);
            if (currentIndex !== -1 && currentIndex < season.episodes.length - 1) {
                const nextEp = season.episodes[currentIndex + 1];
                return { season: season.season_number, ...nextEp };
            }
        } else if (season.season_number === currentSeason + 1 && season.episodes?.length > 0) {
            const firstEp = season.episodes[0];
            return { season: season.season_number, ...firstEp };
        }
    }
    return null;
}

// 更新页面标题
function updatePageTitle(title) {
    document.title = title;
}

// 显示错误信息
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 3000);
}

// 键盘快捷键支持
document.addEventListener('keydown', function (event) {
    if (!player || document.activeElement.tagName === 'INPUT') return;

    const keyMap = {
        ' ': () => player.togglePlay(),
        'ArrowLeft': () => player.currentTime -= 10,
        'ArrowRight': () => player.currentTime += 10,
        'ArrowUp': () => player.volume = Math.min(1, player.volume + 0.1),
        'ArrowDown': () => player.volume = Math.max(0, player.volume - 0.1),
        'f': () => player.fullscreen.toggle(),
        'n': () => playNext(),
    };

    const action = keyMap[event.key];
    if (action) {
        event.preventDefault();
        action();
    }
});

// 创建版本选择列表（聚合内容）
function createVersionsList(container) {
    const versionsTitle = document.createElement('h3');
    versionsTitle.textContent = '版本选择';
    container.appendChild(versionsTitle);

    const versionsList = document.createElement('div');
    versionsList.className = 'versions-list';

    currentMovie.versions.forEach((version, index) => {
        const versionItem = document.createElement('div');
        versionItem.className = `version-item ${version.is_main ? 'current' : ''}`;
        versionItem.innerHTML = `<div>${version.version_name}</div>`;
        if (!version.is_main) {
            versionItem.addEventListener('click', () => switchToVersion(version));
        }
        versionsList.appendChild(versionItem);
    });

    container.appendChild(versionsList);
}

// 切换到指定版本
function switchToVersion(version) {
    showSuccessToast(`正在切换到 ${version.version_name}...`);
    loadMovieFromJson(version.id);
}

// 加载影片封面
function loadMoviePoster() {
    const posterImg = document.getElementById('movie-poster');
    const posterPlaceholder = document.getElementById('poster-placeholder');
    const posterContainer = document.querySelector('.poster-container');
    const movieInfo = document.querySelector('.movie-info');

    if (!posterImg || !posterPlaceholder || !posterContainer || !movieInfo) {
        console.warn('未找到封面相关元素');
        return;
    }

    // 重置状态
    posterImg.style.display = 'none';
    posterPlaceholder.style.display = 'flex';
    posterContainer.classList.remove('error');
    movieInfo.classList.remove('has-poster-bg');
    movieInfo.style.removeProperty('--poster-bg-url');

    // 检查是否有封面路径
    if (!currentMovie.poster_path) {
        showPosterError('未找到封面图片');
        return;
    }

    // 构建 TMDB 封面 URL
    const posterUrl = buildTMDBImageUrl(currentMovie.poster_path, 'w500');
    const posterBgUrl = buildTMDBImageUrl(currentMovie.poster_path, 'w780');

    if (!posterUrl) {
        showPosterError('无法构建封面 URL');
        return;
    }

    console.log('加载封面:', posterUrl);

    // 预加载封面图片
    preloadImage(posterUrl)
        .then(() => {
            // 显示封面
            posterImg.src = posterUrl;
            posterImg.alt = `${currentMovie.title} 封面`;
            posterImg.classList.add('loaded');
            posterImg.style.display = 'block';
            posterPlaceholder.style.display = 'none';

            // 应用背景效果
            if (posterBgUrl) {
                applyPosterBackground(movieInfo, posterBgUrl);
            }

            console.log('封面加载成功');
        })
        .catch(error => {
            console.error('封面加载失败:', error);
            showPosterError('封面加载失败');
        });
}

// 构建 TMDB 图片 URL
function buildTMDBImageUrl(posterPath, size = 'w500') {
    if (!posterPath) return null;

    const baseUrl = 'https://image.tmdb.org/t/p/';
    // 如果是相对路径，添加前缀
    const cleanPath = posterPath.startsWith('/') ? posterPath : '/' + posterPath;

    return `${baseUrl}${size}${cleanPath}`;
}

// 预加载图片
function preloadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();

        const timeout = setTimeout(() => {
            reject(new Error('图片加载超时'));
        }, 10000); // 10秒超时

        img.onload = () => {
            clearTimeout(timeout);
            resolve(img);
        };

        img.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('图片加载失败'));
        };

        img.src = url;
    });
}

// 应用封面背景效果
function applyPosterBackground(movieInfo, backgroundUrl) {
    try {
        // 设置 CSS 变量
        movieInfo.style.setProperty('--poster-bg-url', `url("${backgroundUrl}")`);

        // 添加背景类
        movieInfo.classList.add('has-poster-bg');

        console.log('应用背景效果:', backgroundUrl);
    } catch (error) {
        console.error('应用背景效果失败:', error);
    }
}

// 显示封面错误
function showPosterError(message) {
    const posterPlaceholder = document.getElementById('poster-placeholder');
    const posterContainer = document.querySelector('.poster-container');

    if (posterPlaceholder && posterContainer) {
        posterContainer.classList.add('error');
        const placeholderText = posterPlaceholder.querySelector('.placeholder-text');
        if (placeholderText) {
            placeholderText.textContent = message || '封面加载失败';
        }
    }

    console.warn('封面错误:', message);
}