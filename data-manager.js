const { promises: fs } = require('fs');

async function loadMovies(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    if (!data) { // 检查文件内容是否为空
      return new Map();
    }
    const parsedData = JSON.parse(data);
    // 将数组转换为以电影ID（id）为键的 Map
    return new Map(parsedData.map(movie => [movie.id, movie]));
  } catch (error) {
    // 如果文件不存在或解析失败，返回一个空的 Map
    if (error.code === 'ENOENT') {
      return new Map();
    }
    console.error('Failed to load or parse movies.json:', error);
    return new Map();
  }
}

async function saveMovies(filePath, data) {
  // **关键修复**：确保传入的是数组，如果不是，则假定它是 Map 并转换
  const arrayData = Array.isArray(data) ? data : Array.from(data.values());
  // **关键修复**：确保即使数组为空，也写入 '[]'
  const jsonString = JSON.stringify(arrayData, null, 2) || '[]';
  await fs.writeFile(filePath, jsonString, 'utf-8');
}

module.exports = { loadMovies, saveMovies };