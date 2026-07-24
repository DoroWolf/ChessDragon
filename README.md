<p align="center">
  <img src="public/logo.png" alt="ChessDragon Logo" width="800"/>
</p>

# 象棋龙 ChessDragon

<p align="center">
  <img src="screenshot.jpg" alt="Screenshot" width="700"/>
</p>

一个纯前端实现的像素风格国际象棋小游戏，使用 Vue 3 打造。棋子是我自己画的像素风拟龙原创角色（OC）。

（虽然画技还得修炼XD）  

界面布局模仿了 Chess.com / Lichess 的对局体验，底层**从零实现了一套完整的国际象棋引擎**，无外部象棋库依赖。

## 特性

- **原创角色棋子** – 每枚棋子都是手绘的像素拟龙角色
- **完整规则引擎** – 包含王车易位、吃过路兵、升变、逼和、三次重复局面、50 步规则等，严格遵循国际象棋标准  
- **人机对弈 AI** – 基于 Alpha-Beta 剪枝的 AI，具备多级难度
- **舒适布局** – 仿主流象棋平台的界面设计，棋盘、子力差距等
- **轻量纯前端** – Vue 3 + Vite，适配桌面与移动端
- **开箱即玩** – 已部署到 GitHub Pages，浏览器打开就能玩

## 线上游玩
立即体验 [Demo](https://dorowolf.github.io/ChessDragon)

## 本地运行

```bash
git clone https://github.com/DoroWolf/ChessDragon.git
cd ChessDragon
npm install
npm run dev
```

## 许可与版权

本项目代码使用 [MIT License](LICENSE) 开源。

所有美术设计的版权归原作者所有。角色的二次创作无须授权。
