# 发布步骤（ITISlemon/dsh-sound-cue）

这个目录本身就是可发布的插件包：没有构建步骤，`package.json` 的 `files`
只包含运行时文件，`dev/` 是测试，不会被打进 npm 包。

## 1. 本机需要 Git（当前没有）

```powershell
winget install --id Git.Git -e
```

装完后新开终端，确认 `git --version` 有输出。GitHub 安装路径依赖它（DSH 会先跑
`git ls-remote` 预检）；如果不想装 Git，可以直接用 tarball 地址发布安装方式，
见第 4 步。

## 2. 首次推送到 GitHub

在 https://github.com/new 建一个 **Public** 仓库 `dsh-sound-cue`（不要勾选
README / .gitignore / LICENSE，本地已经有）。然后在
`C:\Users\24522\Desktop\dsh-sound-cue` 里执行：

```powershell
git init
git add -A
git commit -m "dsh-sound-cue 1.4.0"
git branch -M main
git remote add origin https://github.com/ITISlemon/dsh-sound-cue.git
git push -u origin main
```

如果本机 Git 还没配身份，先：

```powershell
git config --global user.name "ITISlemon"
git config --global user.email "你的GitHub邮箱"
```

## 3. 打版本 tag

```powershell
git tag v1.4.0
git push origin v1.4.0
```

之后每次改完，改 `package.json` 的 `version`，再 `git tag vX.Y.Z` 并推送。
装了 tag 的版本才有稳定的安装地址。

## 4. 安装方式（给使用者看，也是 README 里写的）

```powershell
# 需要 Git
dsh plugin --profile desktop add github:ITISlemon/dsh-sound-cue#v1.4.0

# 不需要 Git（tarball）
dsh plugin --profile desktop add https://github.com/ITISlemon/dsh-sound-cue/archive/refs/tags/v1.4.0.tar.gz
```

桌面应用的「设置 → 插件」里也可以用同样的 spec 安装。

## 5. 上架市场（可选）

两条渠道都只认 GitHub 公开仓库：

1. **dsh-plugin.org** —— 仓库 Topics 加 `dsh-plugin`，然后提交
   https://dsh-plugin.org/zh/submit ，自动扫描后以 `unconfirmed` 收录。
2. **dsh-market（内置插件市场）** —— 目录来自 awesome-dsh-plugin.com 的
   `plugins.json`，条目里填仓库地址、安装命令、中英文描述与截图；向该目录
   提 PR / issue 即可。

市场收录要求里最容易漏的两点：Topics 必须有 `dsh-plugin`；README 里的安装命令
里的包名/仓库名必须和实际一致。

## 6. 发 npm（可选，需要 Node.js）

npm 发布要求包名唯一且不是私有包（`private` 已去掉）。当前名字
`dsh-sound-cue` 若在 npm 上未被占用即可直接发布：

```powershell
npm login
npm publish --access public
```

发布后安装：`dsh plugin --profile desktop add dsh-sound-cue@1.4.0`。
若包名已被占用，改成 `@itislemon/dsh-sound-cue` —— 需要同时改
`package.json` 的 `name`、`cordis.patch.yml` 的 `name`、以及 `client.js` 第 2 行的
`__ModuleLoader__.load({ id })`。
