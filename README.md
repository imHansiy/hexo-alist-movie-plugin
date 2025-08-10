# Hexo Alist Movie Plugin

这是一个为 [Hexo](https://hexo.io/) 设计的插件，它可以从您的 [Alist](https://alist.nn.ci/) 服务器获取视频文件列表，使用 [TMDb API](https://www.themoviedb.org/documentation/api) 丰富电影元数据，并最终生成一个精美的电影展示页面。

## 特性

- 自动从 Alist 指定目录拉取视频文件。
- 使用 TMDb API 获取电影海报、简介、评分等详细信息。
- 为无法匹配 TMDb 的视频文件提供优雅的回退处理。
- 生成一个独立的、响应式的电影列表页面。
- 提供一个内置的 HTML5 视频播放器页面。
- 高度可配置。

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

## 许可证

ISC