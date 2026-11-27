# ZMK Studio · afayge 定制版

用图形界面修改 ZMK 键盘的键位、管理多层绑定和备份配置。连接实现配套协议的键盘后，还可以调整 LED 矩阵的预设、分区和逐灯颜色。没有键盘时也可以用内置演示体验操作。

## 下载与安装

应用版本为 **0.4.0**，本次定制版标签为 **v0.4.0-afayge.1**。[发布说明](https://github.com/afayge/zmk-studio/releases/tag/v0.4.0-afayge.1) · [下载 SHA256SUMS.txt](https://github.com/afayge/zmk-studio/releases/download/v0.4.0-afayge.1/SHA256SUMS.txt)

| 系统 | 安装包 | 安装方法 |
| --- | --- | --- |
| macOS（Apple Silicon、Intel） | [通用 DMG][mac] | 打开 DMG，把 ZMK Studio 拖入「应用程序」。 |
| Windows（Intel / AMD 64 位） | [x64 安装程序][win] | 双击安装程序，按向导完成安装。 |
| Linux（Intel / AMD 64 位） | [AppImage][ax] · [DEB][dx] | AppImage 添加执行权限后运行。Debian / Ubuntu 可用 `sudo apt install ./ZMK-Studio-Linux-x64.deb`。 |
| Linux（ARM64） | [AppImage][aa] · [DEB][da] | 选择 ARM64 包。DEB 安装命令为 `sudo apt install ./ZMK-Studio-Linux-arm64.deb`。 |

[mac]: https://github.com/afayge/zmk-studio/releases/download/v0.4.0-afayge.1/ZMK-Studio-macOS-universal.dmg
[win]: https://github.com/afayge/zmk-studio/releases/download/v0.4.0-afayge.1/ZMK-Studio-Windows-x64-setup.exe
[ax]: https://github.com/afayge/zmk-studio/releases/download/v0.4.0-afayge.1/ZMK-Studio-Linux-x64.AppImage
[dx]: https://github.com/afayge/zmk-studio/releases/download/v0.4.0-afayge.1/ZMK-Studio-Linux-x64.deb
[aa]: https://github.com/afayge/zmk-studio/releases/download/v0.4.0-afayge.1/ZMK-Studio-Linux-arm64.AppImage
[da]: https://github.com/afayge/zmk-studio/releases/download/v0.4.0-afayge.1/ZMK-Studio-Linux-arm64.deb

macOS 应用使用临时签名（ad hoc），未经 Apple 公证。Windows 安装程序未使用 Authenticode 签名。核对下载文件时，macOS 可运行 `shasum -a 256 文件名`，Linux 可运行 `sha256sum 文件名`，Windows PowerShell 可运行 `Get-FileHash 文件名 -Algorithm SHA256`，将结果与同一 Release 的 `SHA256SUMS.txt` 比对。

## 第一次改键

1. **连接键盘。** 用能传输数据的 USB 线连接键盘，打开 Studio，在设备列表中选择标为 **USB** 的设备。若键盘固件启用了 Studio 蓝牙传输，也可以选择 **BLE**。设备刚插入时可点 **Refresh devices** 刷新。
2. **在键盘上解锁。** 出现 **Unlock To Continue** 时，按键盘固件配置的 `&studio_unlock` 键或组合键。组合键因键盘而异。若固件没有配置解锁行为，请先查阅键盘的 keymap。[Studio 解锁行为说明](https://zmk.dev/docs/keymaps/behaviors/studio-unlock)
3. **选择层和键位。** 切到要修改的层，点击键盘图上的目标键，在 **Key actions → Basic keys** 选择新键，也可用 **Search actions** 搜索。需要参数的行为，填好参数再点 **Apply binding**。
4. **保存并检查。** 点击顶部 **Save**，确认显示 **Saved to keyboard**。打开 **Output test**，点一下测试区，再按实体键，查看此窗口收到的按下和释放事件。

没有实体键盘时，在欢迎窗口点 **Try a demo keyboard**。可以直接试改键、备份和灯光面板。**Saved in demo session** 表示保存到了这次演示会话。

## 哪些功能需要配套固件

| 要做的事 | 键盘需要支持什么 |
| --- | --- |
| 改键、切层编辑、批量修改与键位备份 | 启用标准 ZMK Studio 并成功解锁。可选行为取决于固件报告的行为列表。 |
| 把矩阵灯光开关、亮度或效果切换绑定到按键 | 固件需提供对应的 LED Matrix 行为和命令。具体可选项以设备上报为准。 |
| 用 **Lighting** 编辑预设、分区、指示灯、逐灯颜色或分别调整分体两侧 | 需要兼容的 LED 矩阵硬件、固件的 Studio 灯光扩展协议，以及板级配置启用相应能力。分体键盘还需要目标侧在线并支持对应操作。 |
| 编辑编码器旋转方向的绑定 | 需要固件上报可编辑的编码器和方向绑定能力。 |

配套固件的开发仓库是 **afayge/zmk**。本次核对的公开 `main` 提交 `e0603e4` 尚未包含 Studio 灯光编辑协议。仅刷入这个提交无法开启上述真机灯效编辑功能；请等该仓库发布明确包含扩展协议、且适用于你键盘型号的版本。当前可通过演示键盘预览。安装本软件不会更新键盘固件。[固件仓库](https://github.com/afayge/zmk) · [已核对的提交](https://github.com/afayge/zmk/tree/e0603e4faac832f9d215f6008a4cee8ee6206b6c)

在支持的设备上，打开 **Lighting**，选择要编辑的一侧和灯组，调整界面列出的颜色或参数，点灯组内的 **Apply** 写入。看到固件更新提示或 LED Matrix 不可用时，可继续使用标准改键功能。

## 备份与恢复键位

打开 **Backup → Binding backup → Export JSON**，保存 `zmk-keymap.json`。文件记录**当前物理布局中各层的按键绑定**。灯效配置和固件镜像不在备份范围内。

恢复时连接同一把键盘，选择相同的物理布局，点 **Preview JSON** 选取备份。先逐层检查差异，再点 **Apply … changes**，最后点顶部 **Save**。如果设备、布局、层 ID 或顺序、行为参数不兼容，界面会显示原因。

## 从源码运行

安装 Node.js 22 和 npm，在仓库根目录运行 `npm ci`，然后用 `npm run dev` 启动开发界面。运行 `npm test` 检查键位与灯光逻辑，运行 `npm run build` 生成网页。扩展协议的 TypeScript 文件已随源码提交。桌面开发另需 Rust 和当前平台的 Tauri 依赖，可用 `npm run tauri -- dev` 启动桌面版。[Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)

本项目基于官方 ZMK Studio；上游贡献者及第三方声明见随附文件。[官方仓库](https://github.com/zmkfirmware/zmk-studio) · [Apache-2.0 许可证](LICENSE) · [NOTICE](NOTICE)
