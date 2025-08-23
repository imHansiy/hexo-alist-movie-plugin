# Hexo Alist Movie Plugin

这是一个为 [Hexo](https://hexo.io/) 设计的插件，它可以从您的 [Alist](https://alist.nn.ci/) 服务器获取视频文件列表，使用 [TMDb API](https://www.themoviedb.org/documentation/api) 丰富电影元数据，并最终生成一个精美的电影展示页面。

## 特性

- **多媒体搜索**：支持电影、电视剧和人物的统一搜索功能
- **智能类型识别**：自动识别媒体类型（movie/tv），优先匹配电影内容
- **流派信息缓存**：启动时自动缓存电影和电视剧的流派信息，提供中文流派名称
- **自动从 Alist 获取**：从指定目录拉取视频文件列表
- **TMDb API 集成**：获取电影海报、简介、评分、流派等详细信息
- **优雅回退处理**：为无法匹配 TMDb 的视频文件提供默认信息
- **响应式设计**：生成独立的、适配各种设备的电影列表页面
- **内置播放器**：提供 HTML5 视频播放器页面
- **多语言支持**：支持多种语言的电影信息获取
- **高度可配置**：灵活的配置选项

## 安装

1.  **安装插件**:
    将此插件文件夹放置在您的 Hexo 项目的任意位置。然后，在您的 Hexo 项目目录中，通过本地路径安装插件：
    ```bash
    npm install /path/to/your/hexo-alist-movie-plugin
    ```

2.  **安装插件依赖**:
    进入插件目录，安装其自身依赖：
    ```bash
    cd /path/to/your/hexo-alist-movie-plugin
    npm install
    ```

## 配置

在您的 Hexo 项目的 `_config.yml` 文件中，添加以下配置：

```yaml
alist_movie_generator:
  alist:
    url: "https://your-alist-url.com"      # 您的 Alist 服务器地址
    username: "your-alist-username"    # Alist 用户名
    password: "your-alist-password"    # Alist 密码
  tmdb_token: "your-tmdb-api-token"    # 您的 TMDb API v3 Auth Token
  directories:
    - "/movies/action"                 # 要扫描的 Alist 目录
    - "/movies/comedy"
  tmdb_language: "zh-CN"                 # (可选) TMDb API 语言，默认为 'zh-CN'
  default_poster: "/static/no_cover.png"   # (可选) 找不到海报时的默认图片，插件内置此路径
```

然后，在 `_config.yml` 中启用该插件：

```yaml
plugin:
  - hexo-alist-movie-plugin
```

## 用法

配置完成后，正常运行 Hexo 命令即可：

```bash
hexo generate  # 生成静态文件
hexo server    # 启动本地服务器
```

插件会自动在 `http://yoursite.com/movies/` 生成电影列表页面。

## 自定义静态文件

本插件会自动处理其 `source/` 目录下的所有静态文件。

例如，插件内置了一个默认的占位图片。该图片位于插件的 `source/static/no_cover.png`，最终会在您的网站中以 `/static/no_cover.png` 的路径提供。

如果您想替换这个默认图片，或者添加自己的 CSS、JavaScript 文件，只需将它们放置在插件的 `source/` 目录下的相应子目录中，插件便会自动将它们包含在您的网站中。

## API 功能说明

### 多媒体搜索 API

插件现在支持 TMDb 的多媒体搜索功能，可以同时搜索电影、电视剧和人物：

```javascript
const tmdbApi = new TMDbAPI(token, log, language);

// 初始化（缓存流派信息）
await tmdbApi.initialize();

// 多媒体搜索
const results = await tmdbApi.searchMulti('星球大战', {
    include_adult: false,
    page: 1
});

// 结果包含：
// - movies: 电影结果
// - tv: 电视剧结果  
// - person: 人物结果
// - 每个结果都包含 media_type 字段和对应的流派名称
```

### 媒体类型识别

- `movie` → 电影
- `tv` → 电视剧
- `person` → 人物

### 流派信息缓存

插件启动时会自动缓存所有电影和电视剧的流派信息，并提供中文流派名称：

```javascript
// 获取流派名称
const genreNames = tmdbApi.getGenreNames('movie', [28, 12, 878]);
// 返回: ['动作', '冒险', '科幻']
```

### 改进的电影详情获取

`getMovieDetails` 方法现在使用多媒体搜索，能更准确地匹配内容：

```javascript
const details = await tmdbApi.getMovieDetails('复仇者联盟.2012.1080p.mkv');
// 返回包含 media_type、genre_names、content_ratings 等新字段的详细信息
```

### 电视剧内容分级

插件现在支持获取电视剧的内容分级信息：

```javascript
// 获取特定电视剧的内容分级
const ratings = await tmdbApi.getTVContentRatings(1399); // 权力的游戏

// 分级信息包含：
// - rating: 分级标识（如 TV-MA, 18, R 等）
// - iso_3166_1: 国家代码（如 US, GB, CN 等）
// - meaning: 分级说明（如 "仅限成人观看"）
```

### 分级系统说明

- **美国 (US)**: TV-Y, TV-Y7, TV-G, TV-PG, TV-14, TV-MA
- **英国 (GB)**: U, PG, 12, 15, 18
- **中国 (CN)**: G, PG, PG-13, R, NC-17

## 页面显示功能

### 电影列表页面
- 显示媒体类型标识（电影/电视剧）
- 显示流派信息
- 显示内容分级（电视剧）
- 响应式卡片布局

### 播放器页面
- 媒体类型标识
- 详细的内容分级信息
- 分级说明提示
- 优化的信息布局

## 故障排除

### 网络连接问题

如果遇到 TMDb API 连接超时错误，可以使用内置的网络测试工具：

```bash
cd /path/to/hexo-alist-movie-plugin
node network-test.js YOUR_TMDB_TOKEN
```

### 常见问题

1. **TMDb API 连接超时**
   - 插件已添加重试机制和降级模式
   - 即使初始化失败，插件仍会继续运行（但无流派信息）
   - 建议检查网络连接或使用代理

2. **无法获取流派信息**
   - 插件会自动降级，使用基本的电影信息
   - 不影响核心播放功能

3. **内容分级显示异常**
   - 仅电视剧支持内容分级
   - 网络问题时会跳过分级获取

### 错误处理机制

插件具备以下错误处理能力：

- **网络超时重试**: 自动重试 2 次，每次间隔 2 秒
- **优雅降级**: 初始化失败时继续运行，只是缺少部分功能
- **超时控制**: 所有 API 请求都有合理的超时时间
- **错误日志**: 详细的错误信息帮助诊断问题

## 示例代码

- `example-multi-search.js` - 多媒体搜索功能示例
- `content-ratings-example.js` - 内容分级功能示例
- `network-test.js` - 网络连接测试工具

## 许可证

ISC
