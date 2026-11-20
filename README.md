# 活动KV智能延展本地算力版

免安装的活动视觉工作台。上传主视觉、可选主标题和 LOGO，直接在画布上移动、缩放，使用访问者电脑的 GPU / CPU 补齐空白，导出 PNG。

这是原本地算力版的独立静态发布版本，保留紧凑界面、撤回、自由裁切、可继续移动的生成背景和浏览器下载。首次打开为空白画布，不包含个人案例、默认品牌素材、API Key 或原站历史。

## 使用

打开本仓库的 GitHub Pages 页面即可使用，无需安装软件、登录 ChatGPT 或配置 API Key。建议使用新版 Chrome / Edge。访问者的素材和生成内容只在其浏览器中处理、保存。

1. 上传主视觉，以及可选的主标题与 LOGO。
2. 选择画布尺寸，拖动素材，拉动四角或使用大小控件调整构图。
3. 选择 LaMa 或 MI-GAN，点击“按当前构图 AI 补齐背景”。
4. 可继续移动已生成背景、调整品牌图层；不满意时撤回。
5. 保存 PNG。

## 网络和模型

| 模型 | 首次加载 | 下载来源 |
| --- | --- | --- |
| LaMa（默认） | 约 64 MB，含计算引擎 | 本网站，同源托管 |
| MI-GAN | 约 57 MB，含计算引擎 | 本网站，同源托管 |
| Moebius（可选） | 约 1.27 GB，含计算引擎 | Hugging Face，需要能访问该下载源 |

LaMa、MI-GAN、ONNX Runtime、字体、脚本全部随本仓库提供。默认流程没有 ChatGPT、OpenAI API、Hugging Face 或第三方 CDN 请求。模型首次按需下载并缓存，推理在本机完成；浏览器仍需能访问网页及其静态文件。本版本不承诺断网后仍能重新打开页面。

**GitHub / GitHub Pages 在不同地区、运营商下的连通性不同，上传到 GitHub 不等于保证所有人免 VPN 访问。** 如果访问者无法打开 GitHub Pages，可将同一套文件部署到他们能够直接访问的 HTTPS 静态服务器；LaMa 和 MI-GAN 无需额外模型服务。

Moebius 权重约 1.24 GB，未内置在此 Pages 站点中。GitHub Pages 的发布站点上限为 1 GB，因此保留原外部下载模式。不能访问 Hugging Face 时选择 LaMa / MI-GAN。参见 [GitHub Pages 限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)。

## 部署与开发

这是可直接发布的 HTML、CSS、JavaScript 源码，不需要 npm install 或构建。

- GitHub Pages：在仓库 **Settings → Pages → Deploy from a branch** 中选择 `main` 和 `/(root)`，保存。
- 其他静态托管：上传本目录的网页、脚本、字体、模型 `.bin` 和 JSON 文件，使用 HTTPS。相对路径同时支持域名根目录和子目录。
- 本机调试：可使用已有的静态 HTTP 服务器；例如已安装 Python 时运行 `python -m http.server 8000`，访问 `http://localhost:8000`。不要直接双击 `index.html`，浏览器会限制本地文件的模块和 Worker。
- 测试：安装 Node.js 后运行 `npm test`，无需额外依赖。

主要文件：`index.html` 为界面，`styles.css` 为样式，`studio.js` 为编辑交互，`worker.js` 为本机推理，`lama.json` / `model.json` / `runtime.json` 记录内置文件大小及 SHA-256。

## 第三方组件

第三方许可、模型说明和署名保留在 `LAMA-*`、`MI-GAN-LICENSE.txt`、`MOEBIUS-*`、`ONNX-RUNTIME-LICENSE.txt` 和 `ORT-README.md` 中。模型的适用范围和生成质量仍受模型、显存与浏览器能力限制。
