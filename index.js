/* global hexo */
'use strict';

if (typeof hexo === 'undefined') {
  return;
}

const path = require('path');
const ejs = require('ejs');
const fs = require('fs');
const AlistAPI = require('./alist-api');
const TMDbAPI = require('./tmdb-api');

hexo.extend.generator.register('alist-movies', async function(locals) {

  const config = hexo.config.alist_movie_generator;

  if (!config) {
    hexo.log.error('Alist Movie Generator: `alist_movie_generator` config is missing.');
    return;
  }

  const { alist, tmdb_token, directories, tmdb_language, default_poster } = config;
  const language = tmdb_language || 'zh-CN';
  const defaultPoster = default_poster || '/static/no_cover.png';
  // 进行严格的配置验证
  if (!alist || !alist.url || !alist.username || !alist.password || !tmdb_token || !directories || !Array.isArray(directories) || directories.length === 0) {
    hexo.log.error('Alist Movie Generator: Configuration is missing or incomplete. Please check url, username, password, tmdb_token, and directories.');
    return;
  }

  hexo.log.info('Alist Movie Generator: Starting generation...');

  const alistApi = new AlistAPI(alist, hexo.log);
  const tmdbApi = new TMDbAPI(tmdb_token, hexo.log, language);
  
  try {
    const videoFiles = await alistApi.getAllVideoFiles(directories);
    hexo.log.info(`Found ${videoFiles.length} video files from Alist.`);

    const moviePromises = videoFiles.map(async (videoFile) => {
      const details = await tmdbApi.getMovieDetails(videoFile.name);
      const cleanedTitle = videoFile.name.replace(/\.(mp4|mkv|avi|rmvb|flv|mov|wmv)$/i, '').replace(/[\[【].*?[\]】]/g, '').trim();
      if (details) {
        return { ...details, poster_path: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : defaultPoster, alist_url: videoFile.url, alist_name: videoFile.name };
      } else {
        return { id: `fallback_${videoFile.name}`, title: cleanedTitle, overview: "暂无简介", poster_path: defaultPoster, release_date: "", genres: [], vote_average: 0, alist_url: videoFile.url, alist_name: videoFile.name };
      }
    });

    const allMovies = await Promise.all(moviePromises);
    hexo.log.info(`Successfully processed ${allMovies.length} movies.`);

    hexo.log.info('Alist Movie Generator: Generation complete. Returning routes...');

    // 渲染电影模板内容
    const templatePath = path.join(__dirname, 'templates', 'movies.ejs');
    const movieContent = await ejs.renderFile(templatePath, { movies: allMovies });

    const movieRoutes = [
      // 1. 电影列表页面 - 使用Hexo布局系统（通过 page 视图承载 content，从而由主题 layout 包裹并保留导航）
      {
        path: 'movies/index.html',
        data: {
          title: '电影中心',
          content: movieContent
        },
        layout: ['page', 'index']
      },
      // 2. 电影数据 API
      {
        path: 'data/movies.json',
        data: JSON.stringify(allMovies)
      }
    ];

    // 3. 处理所有 source 子目录中的静态文件
    const sourceDir = path.join(__dirname, 'source');
    const sourceSubDirs = fs.readdirSync(sourceDir).filter(f => fs.statSync(path.join(sourceDir, f)).isDirectory());
    
    let staticRoutes = [];
    sourceSubDirs.forEach(dir => {
      const subDirPath = path.join(sourceDir, dir);
      const files = fs.readdirSync(subDirPath);
      const routes = files.map(file => {
        return {
          path: `${dir}/${file}`,
          data: () => fs.createReadStream(path.join(subDirPath, file))
        };
      });
      staticRoutes = staticRoutes.concat(routes);
    });

    return movieRoutes.concat(staticRoutes);

  } catch (error) {
    hexo.log.error('Alist Movie Generator: An unrecoverable error occurred.', error);
    return []; // 在出错时返回一个空数组
  }
});