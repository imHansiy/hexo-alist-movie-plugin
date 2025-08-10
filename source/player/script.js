document.addEventListener('DOMContentLoaded', () => {
    const videoElement = document.getElementById('player');
    const playerContainer = document.querySelector('.player-container');
    const movieInfoContainer = document.querySelector('.movie-info');
    const recommendationsContainer = document.querySelector('.recommendations');

    let allMovies = []; // 存储所有电影数据
    let currentMovie = null; // 存储当前电影数据

    // --- Plyr 播放器初始化 ---
    const player = new Plyr(videoElement, {
        title: '正在加载...',
        controls: [
            'play-large', 'play', 'progress', 'current-time', 'mute',
            'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'
        ],
    });
    window.player = player; // 方便调试

    /**
     * 根据 URL 类型智能选择加载方式
     * @param {string} videoUrl - 视频文件的 URL
     */
    function loadVideoSource(videoUrl) {
        if (!videoUrl) return;
        const isM3u8 = videoUrl.toLowerCase().endsWith('.m3u8');

        if (isM3u8 && Hls.isSupported()) {
            console.log('M3U8 source detected. Using Hls.js');
            const hls = new Hls();
            hls.loadSource(videoUrl);
            hls.attachMedia(videoElement);
            window.hls = hls;
        } else {
            console.log('Direct playback source detected. Setting video.src');
            videoElement.src = videoUrl;
        }
    }

    /**
    /**
     * 渲染主电影信息
     * @param {object} movie - 当前播放的电影对象
     */
    function renderMainMovieInfo(movie) {
        if (!movie || !movieInfoContainer) return;

        const movieTitle = movieInfoContainer.querySelector('.movie-title');
        const movieDetails = movieInfoContainer.querySelector('.movie-details');
        const movieOverview = movieInfoContainer.querySelector('.movie-overview');
        
        movieTitle.textContent = movie.title || '未知标题';
        movieOverview.textContent = movie.overview || '暂无简介。';

        // 构建电影详情，例如年份和评分
        const year = movie.release_date ? `(${movie.release_date.substring(0, 4)})` : '';
        const rating = typeof movie.vote_average === 'number' ? `⭐ ${movie.vote_average.toFixed(1)}` : '';
        movieDetails.textContent = `${year} ${rating}`.trim();

        // 更新播放器标题
        player.source = {
            type: 'video',
            title: movie.title,
            sources: [{
                src: movie.alist_url,
                type: 'video/mp4', // 假设是mp4, Hls.js 会处理 m3u8
            }],
        };

        // 加载视频源
        loadVideoSource(movie.alist_url);
    }

    /**
     * 渲染推荐列表
     * @param {Array} movies - 所有电影的列表
     * @param {string} currentMovieId - 当前电影的ID，用于排除
     */
    function renderRecommendations(movies, currentMovieId) {
        if (!recommendationsContainer) return;
        
        recommendationsContainer.innerHTML = ''; // 清空现有内容
        const recommendationTitle = document.createElement('h3');
        recommendationTitle.textContent = '接下来播放';
        recommendationsContainer.appendChild(recommendationTitle);

        const recommendationsList = document.createElement('ul');
        
        // 筛选、打乱并截取推荐影片
        const filteredMovies = movies
            .filter(m => m.id.toString() !== currentMovieId)
            .sort(() => 0.5 - Math.random()) // 简单随机排序
            .slice(0, 10); // 最多显示10个

        filteredMovies.forEach(movie => {
            const listItem = document.createElement('li');
            listItem.className = 'recommendation-item';
            listItem.innerHTML = `
                <a href="?movie_id=${movie.id}">
                    <img src="${movie.poster_path}" alt="${movie.title}" class="recommendation-poster">
                    <div class="recommendation-info">
                        <span class="recommendation-title">${movie.title}</span>
                        <span class="recommendation-details">${typeof movie.vote_average === 'number' && movie.vote_average > 0 ? `⭐ ${movie.vote_average.toFixed(1)}` : '无评分'}</span>
                    </div>
                </a>
            `;
            recommendationsList.appendChild(listItem);
        });
        recommendationsContainer.appendChild(recommendationsList);
    }


    /**
     * 主执行函数
     */
    async function main() {
        const params = new URLSearchParams(window.location.search);
        const movieId = params.get('movie_id');

        if (!movieId) {
            playerContainer.innerHTML = '<h1>错误：缺少 movie_id 参数</h1>';
            return;
        }

        try {
            // 从站点根目录获取 movies.json
            const response = await fetch('/data/movies.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            allMovies = await response.json();
            
            // 查找当前电影
            currentMovie = allMovies.find(m => m.id.toString() === movieId);

            if (currentMovie) {
                document.title = `${currentMovie.title} - 播放器`;
                renderMainMovieInfo(currentMovie);
                renderRecommendations(allMovies, movieId);
            } else {
                playerContainer.innerHTML = `<h1>错误：未找到 ID 为 ${movieId} 的电影</h1>`;
            }

        } catch (error) {
            console.error('加载电影数据失败:', error);
            playerContainer.innerHTML = '<h1>错误：加载电影数据失败，请检查 `movies.json` 是否存在。</h1>';
        }
    }

    // 启动
    main();
});