# Hexo Alist Movie Plugin

[![Author](https://img.shields.io/badge/Author-Hansiy-blue.svg)](https://hansiy.net)
[![License](https://img.shields.io/badge/License-ISC-green.svg)](https://github.com/imHansiy/hexo-alist-movie-plugin/blob/main/LICENSE)

A powerful Hexo plugin that connects to your [Alist](https://alist.nn.ci/) server, automatically scans and analyzes your media resources with a built-in **Smart Recognition Engine**, and generates beautifully designed movie and TV show pages for your website, enriched with extensive metadata from the [TMDb API](https://www.themoviedb.org/).

## ✨ Core Features

- **🧠 Smart Recognition Engine**: No manual categorization needed! The plugin automatically analyzes directories with mixed content, intelligently identifies movies and TV shows, and extracts season/episode numbers from complex filenames.
- **🎯 Precise TMDb ID Matching**: Supports using TMDb IDs directly in folder or file names (e.g., `Movie Title (tmdbid-12345)`) for 100% accurate metadata matching.
- **🔄 Content Aggregation**: Automatically groups different versions (e.g., 4K, 1080p) or formats (e.g., movie cut, TV series cut) of the same media into a single entry, with version selection available on the player page.
- **📚 Rich Metadata**: Fetches a vast amount of information including posters, overviews, cast, ratings, genres, content ratings, air status, production companies, and more.
- **🎨 Modern Frontend**:
    - A responsive, masonry-style list page with **real-time filtering and sorting** by type, title, rating, date, and more.
    - A modern player page based on [Plyr.js](https://plyr.io/).
    - A **File Recognition Comparison Tool** to help you diagnose and optimize your file naming.
- **🔌 Flexible Configuration**: Configure multiple Alist directories, specifying each as movies, TV shows, or mixed content to be handled by the smart engine.
- **🌐 Robust & Stable**: Features built-in API request retries and caching, ensuring it can gracefully degrade during network instability to guarantee your site still builds.

## 🚀 Quick Start

### 1. Install the Plugin

In your Hexo blog's root directory, run the following command:

```bash
npm install /path/to/your/hexo-alist-movie-plugin
```
*Please replace `/path/to/your/hexo-alist-movie-plugin` with the actual path to the plugin.*

Then, navigate to the plugin's directory and install its own dependencies:
```bash
cd /path/to/your/hexo-alist-movie-plugin
npm install
```

### 2. Configure the Plugin

In your Hexo root `_config.yml` file, add the following configuration and modify it to match your setup:

```yaml
# Alist Movie Library Generator Config
alist_movie_generator:
  # Alist Server Information (Required)
  alist:
    url: "https://your-alist-url.com"      # Your Alist server address
    username: "your-alist-username"    # Alist username
    password: "your-alist-password"    # Alist password

  # TMDb API v3 Auth Token (Required)
  # You can get a free token from https://www.themoviedb.org/settings/api
  tmdb_token: "your-tmdb-api-v3-auth-token"

  # (Recommended) Use the new categorized directory config for more flexibility
  # Movie Directories
  movies:
    - path: "/movies/action"     # Path to movies in Alist
      # title: "Action Movies"       # (Optional) Custom title for this directory
      # detection_config: "strict" # (Optional) Use a specific recognition preset (default, chinese, strict, loose)
    - path: "/movies/comedy"

  # TV Show Directories
  tv_shows:
    - path: "/tv/us"             # Path to TV shows in Alist
    - path: "/tv/jp"

  # (Recommended) Mixed Content Directories - Enables the Smart Recognition Engine
  mixed_content:
    - path: "/mixed_media"       # Path to mixed content; the plugin will auto-detect movies/TV shows

  # Output Configuration (Optional)
  output:
    route: "media"               # Route for the generated pages, defaults to 'movies' (e.g., yoursite.com/media/)
    per_page: 24                 # Number of items per page in the list view, defaults to 20
    order_by: "rating"           # Default sorting field (rating, popularity, date, title), defaults to 'title'
    order: "desc"                # Default sort direction (asc, desc), defaults to 'asc'
```
*Note: The new configuration using `movies`, `tv_shows`, and `mixed_content` is recommended. The original `directories` option is still supported for backward compatibility but is deprecated.*

### 3. Generate Your Site

Run the Hexo commands as you normally would:

```bash
hexo clean && hexo generate
```

The plugin will automatically fetch data and generate pages into your `public` directory. You can access the list page at `http://yoursite.com/movies/` (or your custom route).

## 🔧 Advanced Usage

### Best Practices for File Naming & Directory Structure

To achieve the highest recognition accuracy, we recommend the following structure:

```
/Alist_Root
├── Movies
│   ├── Avatar (2009)
│   │   ├── Avatar.2009.1080p.mkv
│   │   └── poster.jpg
│   ├── Your Name (tmdbid-372058)  <-- BEST PRACTICE! Use TMDb ID
│   │   └── Your.Name.2016.2160p.mkv
│   └── ...
└── TV Shows
    ├── Game of Thrones
    │   ├── Season 01
    │   │   ├── Game.of.Thrones.S01E01.mkv
    │   │   └── Game.of.Thrones.S01E02.mkv
    │   └── Season 02
    │       └── ...
    ├── SPY×FAMILY (tmdbid-120089)   <-- BEST PRACTICE! Use TMDb ID
    │   ├── S01
    │   │   └── ...
    │   └── ...
    └── ...
```

**Key Tips**:
1.  **Create a separate folder for each movie or TV show**.
2.  **Include the year in the folder name**, e.g., `Movie Title (2023)`.
3.  **Organize TV shows into season folders**, e.g., `Season 01` or `S01`.
4.  **【STRONGLY RECOMMENDED】Use TMDb IDs**: Add `(tmdbid-movieID)` or `(tmdbid-tvshowID)` to the folder or file name. The plugin will prioritize this ID for a 100% accurate match.

### File Recognition Comparison Tool

The plugin automatically generates a comparison page to help you check the recognition results.
Visit `http://yoursite.com/movies/comparison.html` (or your custom route) to see:
-   The original file name and path.
-   The media title identified by the plugin.
-   The match status (Success, Partial, Failed).

This tool is invaluable for troubleshooting and optimizing your file naming conventions.

## ❓ FAQ

- **What if the TMDb API connection fails or times out?**
  - The plugin has a built-in retry mechanism. Please ensure your server can access `api.themoviedb.org`. You may need to configure a proxy if running on a server in a region with network restrictions.
- **Some of my media is identified incorrectly. What can I do?**
  - First, check the **File Recognition Comparison Tool** page to see the details.
  - The best solution is to use the **TMDb ID naming convention**, which guarantees accuracy.
  - Alternatively, try to make your folder and file names more standardized.
- **Can I customize the style of the player page?**
  - Yes. You can directly edit the `source/player/style.css` file within the plugin's directory or override its styles in your Hexo theme's CSS.

## 📄 License

[ISC](https://github.com/imHansiy/hexo-alist-movie-plugin/blob/main/LICENSE)