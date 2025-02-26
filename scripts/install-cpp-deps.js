// scripts/install-cpp-deps.js
const https = require('https');
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');

// 创建include目录
const includeDir = path.join(__dirname, '..', 'include');
mkdirp.sync(includeDir);

// JSON库的URL
const jsonUrl = 'https://raw.githubusercontent.com/nlohmann/json/develop/single_include/nlohmann/json.hpp';

// 下载文件的函数
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        
        https.get(url, response => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }

            response.pipe(file);
            
            file.on('finish', () => {
                file.close();
                console.log(`Successfully downloaded: ${dest}`);
                resolve();
            });
        }).on('error', err => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

async function main() {
    try {
        // 创建nlohmann目录
        const nlohmannDir = path.join(includeDir, 'nlohmann');
        mkdirp.sync(nlohmannDir);
        
        // 下载json.hpp
        const jsonDest = path.join(nlohmannDir, 'json.hpp');
        console.log('Downloading json.hpp...');
        await downloadFile(jsonUrl, jsonDest);
        
        console.log('All dependencies installed successfully!');
    } catch (error) {
        console.error('Error installing dependencies:', error);
        process.exit(1);
    }
}

main();